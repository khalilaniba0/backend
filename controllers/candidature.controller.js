const candidatureModel = require('../models/candidature.model');
const offreEmploiModel = require('../models/offreEmploi.model');
const candidatModel = require('../models/candidat.model');
const entretienModel = require('../models/entretien.model');
const utilisateurModel = require('../models/utilisateur.model');
const { createCalendarEvent } = require('../utils/googleCalendar');
const crypto = require('crypto');
const path = require('path');
const { scorerCV } = require('../utils/iaScoringClient');

const ALLOWED_TRANSITIONS = {
    'soumise': ['preselectionne', 'refuse'],
    'preselectionne': ['test_technique', 'entretien_planifie', 'refuse'],
    'test_technique': ['entretien_planifie', 'offre', 'refuse'],
    'entretien_planifie': ['entretien_passe', 'refuse'],
    'entretien_passe': ['offre', 'refuse'],
    'offre': ['accepte', 'refuse'],
    'accepte': [],
    'refuse': []
};

const normaliserCandidatureSortie = (doc) => {
    const candidature = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
    return {
        ...candidature,
        lettre_motivation: candidature.lettre_motivation || candidature.lettreMotivation,
        score_ia: candidature.score_ia !== undefined ? candidature.score_ia : candidature.scoreIA,
        rapport_ia: candidature.rapport_ia !== undefined ? candidature.rapport_ia : candidature.rapportIA
    };
};

const buildCvAbsolutePath = (reqFile, cvUrl) => {
    if (reqFile && reqFile.path) {
        return path.resolve(reqFile.path);
    }

    if (!cvUrl) {
        return null;
    }

    const fileName = path.basename(String(cvUrl).replace(/\\/g, '/'));
    return path.join(__dirname, '..', 'public', 'cv', fileName);
};

module.exports.supprimerCandidaturesParOffre = async (offreId, entrepriseId) => {
    if (!offreId) {
        throw new Error('offreId is required for cascade delete');
    }

    const baseFilter = { offre: offreId };
    if (entrepriseId) {
        baseFilter.entreprise = entrepriseId;
    }

    const candidatures = await candidatureModel.find(baseFilter).select('_id');
    if (!candidatures.length) {
        return { candidatures: 0, entretiens: 0 };
    }

    const candidatureIds = candidatures.map((candidature) => candidature._id);

    const entretienFilter = { candidature: { $in: candidatureIds } };
    if (entrepriseId) {
        entretienFilter.entreprise = entrepriseId;
    }

    const [entretienResult, candidatureResult] = await Promise.all([
        entretienModel.deleteMany(entretienFilter),
        candidatureModel.deleteMany(baseFilter)
    ]);

    return {
        candidatures: candidatureResult.deletedCount || 0,
        entretiens: entretienResult.deletedCount || 0
    };
};

module.exports.postuler = async (req, res) => {
    try {
        if (!req.candidatId) {
            return res.status(401).json({ message: 'Non authentifie. Connexion candidat requise.' });
        }

        const { lettre_motivation, lettreMotivation, offre } = req.body;

        if (!offre) {
            return res.status(400).json({ message: 'offre est requise.' });
        }

        const candidat = await candidatModel.findById(req.candidatId);
        if (!candidat) {
            return res.status(404).json({ message: 'Candidat introuvable.' });
        }

        const existante = await candidatureModel.findOne({ candidat: req.candidatId, offre });
        if (existante) {
            return res.status(400).json({ message: 'Vous avez deja postule a cette offre' });
        }

        const offreTrouvee = await offreEmploiModel.findById(offre);
        if (!offreTrouvee) {
            return res.status(404).json({ message: 'Offre not found' });
        }

        const statutOffre = offreTrouvee.statut || offreTrouvee.status;
        if (statutOffre !== 'open') {
            return res.status(400).json({ message: 'This offer is closed' });
        }

        if (offreTrouvee.dateLimite && new Date(offreTrouvee.dateLimite) < new Date()) {
            return res.status(400).json({ message: 'The deadline for this offer has passed' });
        }

        const hasUploadedCv = Boolean(req.file && req.file.filename);
        const hasProfileCv = Boolean(candidat.cv_url);

        if (!hasUploadedCv && !hasProfileCv) {
            return res.status(422).json({
                message: 'CV requis: ajoutez un CV depuis votre profil ou telechargez un CV pour cette candidature.'
            });
        }

        const cv_url = hasUploadedCv ? req.file.filename : candidat.cv_url;
        const tokenSuivi = crypto.randomUUID();

        const candidature = await candidatureModel.create({
            candidat: req.candidatId,
            nom: candidat.nom,
            email: candidat.email,
            telephone: candidat.telephone,
            cv_url,
            lettreMotivation: lettreMotivation !== undefined ? lettreMotivation : lettre_motivation,
            entreprise: offreTrouvee.entreprise,
            offre,
            tokenSuivi
        });

        (async () => {
            try {
                const offrePourScoring = await offreEmploiModel
                    .findById(offre)
                    .select('poste post description exigences requirements niveauExperience niveauEducation langues');

                if (!offrePourScoring) {
                    return;
                }

                const cvFilePath = buildCvAbsolutePath(req.file, cv_url);
                if (!cvFilePath) {
                    await candidatureModel.findByIdAndUpdate(candidature._id, { scoreIA: null });
                    return;
                }

                const scoreResult = await scorerCV(cvFilePath, offrePourScoring);
                const scoreGlobalValue = Number(scoreResult?.score_global);
                const scoreIA = Number.isFinite(scoreGlobalValue) ? scoreGlobalValue : null;

                await candidatureModel.findByIdAndUpdate(candidature._id, {
                    scoreIA,
                    rapportIA: scoreResult || null
                });
            } catch (iaError) {
                console.error('[IA] score-cv', {
                    candidatureId: candidature._id,
                    offreId: offre,
                    status: iaError.status || null,
                    message: iaError.message,
                    details: iaError.details || null
                });

                try {
                    await candidatureModel.findByIdAndUpdate(candidature._id, { scoreIA: null });
                } catch (persistError) {
                    console.error('[IA] score-cv persist-null failed', {
                        candidatureId: candidature._id,
                        message: persistError.message
                    });
                }
            }
        })();

        return res.status(201).json({
            message: 'Condidature created successfully',
            tokenSuivi,
            candidatureId: candidature._id
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.mesCandidatures = async (req, res) => {
    try {
        if (!req.candidatId) {
            return res.status(401).json({ message: 'Non authentifie. Connexion candidat requise.' });
        }

        const candidatures = await candidatureModel
            .find({ candidat: req.candidatId })
            .populate({
                path: 'offre',
                select: 'poste post typeContrat localisation entreprise',
                populate: { path: 'entreprise', select: 'nom logo secteur siteWeb' }
            })
            .sort({ createdAt: -1 });

        const candidatureIds = candidatures.map(function (item) {
            return item._id;
        });

        let entretienByCandidatureId = {};
        if (candidatureIds.length > 0) {
            const entretiens = await entretienModel
                .find({ candidature: { $in: candidatureIds } })
                .sort({ dateEntretien: -1 });

            entretienByCandidatureId = entretiens.reduce(function (acc, entretien) {
                const candidatureId = entretien?.candidature ? String(entretien.candidature) : null;
                if (!candidatureId) {
                    return acc;
                }

                if (!acc[candidatureId]) {
                    acc[candidatureId] = {
                        _id: entretien._id,
                        dateEntretien: entretien.dateEntretien || entretien.date_entretien || null,
                        typeEntretien: entretien.typeEntretien || entretien.type_entretien || null,
                        lienVisio: entretien.lienVisio || entretien.lien_visio || null,
                        reponse: entretien.reponse || null
                    };
                }

                return acc;
            }, {});
        }

        const payload = candidatures.map(function (candidature) {
            const normalizedCandidature = normaliserCandidatureSortie(candidature);
            const candidatureId = String(candidature._id);
            const entretien = entretienByCandidatureId[candidatureId] || null;

            if (!entretien) {
                return normalizedCandidature;
            }

            return {
                ...normalizedCandidature,
                entretien
            };
        });

        return res.status(200).json({
            message: 'Candidatures recuperees.',
            data: payload
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.annulerCandidature = async (req, res) => {
    try {
        if (!req.candidatId) {
            return res.status(401).json({ message: 'Non authentifie. Connexion candidat requise.' });
        }

        const candidature = await candidatureModel.findOne({ _id: req.params.id, candidat: req.candidatId });
        if (!candidature) {
            return res.status(404).json({ message: 'Condidature not found' });
        }

        if (candidature.etape !== 'soumise') {
            return res.status(400).json({
                message: 'Impossible d\'annuler une candidature deja en cours de traitement'
            });
        }

        await candidatureModel.deleteOne({ _id: candidature._id });
        return res.status(200).json({ message: 'Candidature annulee avec succes.' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.modifierCandidature = async (req, res) => {
    try {
        if (!req.candidatId) {
            return res.status(401).json({ message: 'Non authentifie. Connexion candidat requise.' });
        }

        const candidature = await candidatureModel.findOne({ _id: req.params.id, candidat: req.candidatId });
        if (!candidature) {
            return res.status(404).json({ message: 'Condidature not found' });
        }

        if (candidature.etape !== 'soumise') {
            return res.status(400).json({
                message: 'Impossible de modifier une candidature deja en cours de traitement'
            });
        }

        const { lettre_motivation, lettreMotivation, cv_url } = req.body;

        if (lettreMotivation !== undefined || lettre_motivation !== undefined) {
            candidature.lettreMotivation = lettreMotivation !== undefined ? lettreMotivation : lettre_motivation;
        }

        if (req.file) {
            candidature.cv_url = req.file.filename;
        } else if (cv_url !== undefined) {
            candidature.cv_url = cv_url;
        }

        await candidature.save();
        return res.status(200).json({ message: 'Candidature modifiee avec succes.', data: normaliserCandidatureSortie(candidature) });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};




module.exports.getAllCandidatures = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const filter = { entreprise: req.entrepriseId };
        if (req.query.offre) filter.offre = req.query.offre;
        if (req.query.etape) filter.etape = req.query.etape;

        const candidatures = await candidatureModel
            .find(filter)
            .populate('offre')
            .populate('candidat', 'nom email telephone cv_url photo_url')
            .sort({ scoreIA: -1 });

        const planifiees = candidatures.filter(function (c) {
            return c.etape === 'entretien_planifie';
        });

        if (planifiees.length > 0) {
            const candidatureIds = planifiees.map(function (c) {
                return c._id;
            });

            const entretiens = await entretienModel.find({
                entreprise: req.entrepriseId,
                candidature: { $in: candidatureIds }
            }).select('candidature');

            const existingIds = new Set(
                entretiens
                    .map(function (e) {
                        return e.candidature ? String(e.candidature) : null;
                    })
                    .filter(Boolean)
            );

            const staleIds = candidatureIds.filter(function (id) {
                return !existingIds.has(String(id));
            });

            if (staleIds.length > 0) {
                await candidatureModel.updateMany(
                    { _id: { $in: staleIds }, entreprise: req.entrepriseId, etape: 'entretien_planifie' },
                    {
                        $set: { etape: 'preselectionne', dateEntretien: null, typeEntretien: null }
                    }
                );

                candidatures.forEach(function (c) {
                    if (staleIds.some(function (id) { return String(id) === String(c._id); })) {
                        c.etape = 'preselectionne';
                        c.dateEntretien = null;
                        c.typeEntretien = null;
                    }
                });
            }
        }

        return res.status(200).json({
            message: 'Candidatures retrieved successfully',
            data: candidatures.map(normaliserCandidatureSortie)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.getAllCondidatures = module.exports.getAllCandidatures;

module.exports.getCandidatureById = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const candidature = await candidatureModel
            .findOne({ _id: req.params.id, entreprise: req.entrepriseId })
            .populate('offre');

        if (!candidature) {
            return res.status(404).json({ message: 'Candidature not found' });
        }

        return res.status(200).json({ message: 'Candidature retrieved successfully', data: normaliserCandidatureSortie(candidature) });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.getCandidatureById = module.exports.getCandidatureById;

module.exports.getCandidaturesByOffre = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const offreId = req.params.offreId;
        if (!offreId) {
            return res.status(400).json({ message: 'Offre ID is required' });
        }

        const offre = await offreEmploiModel.findOne({ _id: offreId, entreprise: req.entrepriseId });
        if (!offre) {
            return res.status(404).json({ message: 'Offre not found' });
        }

        const candidatures = await candidatureModel
            .find({ offre: offreId, entreprise: req.entrepriseId })
            .populate('offre')
            .populate('candidat', 'nom email telephone cv_url photo_url')
            .sort({ scoreIA: -1 });

        return res.status(200).json({
            message: 'Condidatures retrieved successfully',
            data: candidatures.map(normaliserCandidatureSortie)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.getCandidaturesByOffre = module.exports.getCandidaturesByOffre;

module.exports.updateCandidatureEtape = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const candidature = await candidatureModel
            .findOne({ _id: req.params.id, entreprise: req.entrepriseId })
            .populate('candidat')
            .populate('offre', 'poste post');

        if (!candidature) {
            return res.status(404).json({ message: 'Candidature not found' });
        }

        const {
            etape,
            score_ia,
            scoreIA,
            dateEntretien,
            date_entretien,
            typeEntretien,
            type_entretien
        } = req.body;

        const dateEntretienInput = dateEntretien !== undefined ? dateEntretien : date_entretien;
        const typeEntretienInput = typeEntretien !== undefined ? typeEntretien : type_entretien;
        const validTypes = ['Présentiel', 'Visio', 'Téléphone'];
        const typeEntretienMap = {
            'Présentiel': 'presentiel',
            'Visio': 'visio',
            'Téléphone': 'telephone'
        };
        let parsedDateEntretien = null;
        let normalizedTypeEntretien = null;
        let googleWarning;

        if (scoreIA !== undefined || score_ia !== undefined) {
            candidature.scoreIA = scoreIA !== undefined ? scoreIA : score_ia;
        }

        const etapeSource = candidature.etape;
        const previousDateEntretien = candidature.dateEntretien;
        const previousTypeEntretien = candidature.typeEntretien;

        if (etape) {
            if (etape === candidature.etape) {
                await candidature.save();
                return res.status(200).json({
                    message: 'Candidature updated successfully',
                    data: normaliserCandidatureSortie(candidature)
                });
            }

            const allowed = ALLOWED_TRANSITIONS[candidature.etape] || [];
            if (!allowed || !allowed.includes(etape)) {
                return res.status(400).json({
                    message: `Transition invalide: ${candidature.etape} -> ${etape}`,
                    allowedTransitions: allowed
                });
            }

            if (etape === 'entretien_planifie') {
                if (!dateEntretienInput || !typeEntretienInput) {
                    return res.status(400).json({ message: "Veuillez fournir la date et le type d'entretien." });
                }

                if (!validTypes.includes(typeEntretienInput)) {
                    return res.status(400).json({ message: `typeEntretien invalide: ${typeEntretienInput}` });
                }

                parsedDateEntretien = new Date(dateEntretienInput);
                if (Number.isNaN(parsedDateEntretien.getTime())) {
                    return res.status(400).json({ message: "La date d'entretien est invalide." });
                }

                normalizedTypeEntretien = typeEntretienMap[typeEntretienInput];
                candidature.dateEntretien = parsedDateEntretien;
                candidature.typeEntretien = typeEntretienInput;

                if (!req.userId) {
                    return res.status(401).json({ message: 'Unauthorized: userId is required' });
                }
            }

            candidature.etape = etape;
        }

        await candidature.save();

        if (etape === 'entretien_planifie') {
            let entretien;
            try {
                entretien = await entretienModel.findOne({
                    candidature: candidature._id,
                    entreprise: req.entrepriseId
                });

                if (!entretien) {
                    entretien = new entretienModel({
                        candidature: candidature._id,
                        entreprise: req.entrepriseId,
                        etapeSource,
                        responsable: req.userId,
                        dateEntretien: parsedDateEntretien,
                        typeEntretien: normalizedTypeEntretien,
                        candidatEmail: candidature.email || candidature?.candidat?.email,
                        candidatNom: candidature.nom || candidature?.candidat?.nom,
                        poste: candidature?.offre?.poste || candidature?.offre?.post
                    });
                } else {
                    entretien.etapeSource = entretien.etapeSource || etapeSource;
                    entretien.responsable = req.userId;
                    entretien.dateEntretien = parsedDateEntretien;
                    entretien.typeEntretien = normalizedTypeEntretien;
                    entretien.candidatEmail = candidature.email || candidature?.candidat?.email || entretien.candidatEmail;
                    entretien.candidatNom = candidature.nom || candidature?.candidat?.nom || entretien.candidatNom;
                    entretien.poste = candidature?.offre?.poste || candidature?.offre?.post || entretien.poste;
                }

                await entretien.save();
            } catch (entretienError) {
                candidature.etape = etapeSource;
                candidature.dateEntretien = previousDateEntretien;
                candidature.typeEntretien = previousTypeEntretien;
                await candidature.save();
                return res.status(500).json({
                    message: "Impossible de synchroniser l'entretien. La candidature a ete restauree a l'etape precedente."
                });
            }

            try {
                const rhUser = await utilisateurModel.findById(req.userId).select('googleTokens');

                if (!rhUser?.googleTokens) {
                    googleWarning = "RH non connecté à Google Calendar. Connectez votre compte Google dans les paramètres.";
                } else if (rhUser?.googleTokens?.refresh_token) {
                    if (!entretien.googleEventId) {
                        const { eventId, meetLink } = await createCalendarEvent({
                            tokens: rhUser.googleTokens,
                            entretien
                        });

                        entretien.lienVisio = meetLink;
                        entretien.googleEventId = eventId;
                        await entretien.save();
                    }
                } else {
                    console.error('Google Calendar sync skipped: missing refresh_token for RH user');
                }
            } catch (googleError) {
                console.error('Google Calendar sync failed (non-bloquant):', googleError.message);
            }
        }

        const responsePayload = {
            message: 'Candidature updated successfully',
            data: normaliserCandidatureSortie(candidature)
        };

        if (googleWarning) {
            responsePayload.googleWarning = googleWarning;
        }

        return res.status(200).json(responsePayload);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.updateCandidatureEtape = module.exports.updateCandidatureEtape;

module.exports.refuserCandidature = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const candidature = await candidatureModel
            .findOne({ _id: req.params.id, entreprise: req.entrepriseId })
            .populate('candidat')
            .populate('offre', 'poste post');

        if (!candidature) {
            return res.status(404).json({ message: 'Candidature not found' });
        }

        candidature.etape = 'refuse';
        await candidature.save();

        return res.status(200).json({
            message: 'Candidature refusee avec succes',
            data: normaliserCandidatureSortie(candidature)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.deleteCandidatureById = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: 'Access denied: tenant is required' });
        }

        const candidature = await candidatureModel
            .findOne({ _id: req.params.id, entreprise: req.entrepriseId })
            .populate('candidat')
            .populate('offre', 'poste post');

        if (!candidature) {
            return res.status(404).json({ message: 'Candidature not found' });
        }

        await candidatureModel.deleteOne({ _id: candidature._id, entreprise: req.entrepriseId });

        return res.status(200).json({ message: 'Candidature deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports.deleteCandidatureById = module.exports.deleteCandidatureById;
