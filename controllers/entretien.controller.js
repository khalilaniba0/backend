const entretienModel = require('../models/entretien.model');
const candidatureModel = require('../models/candidature.model');
const utilisateurModel = require('../models/utilisateur.model');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../utils/googleCalendar');

const isVisioType = (typeEntretien) => {
    return typeof typeEntretien === 'string' && typeEntretien.trim().toLowerCase() === 'visio';
};

const parseDateEntretien = (dateRaw, timeRaw) => {
    if (!dateRaw) return null;

    const parsed = new Date(dateRaw);
    if (Number.isNaN(parsed.getTime())) return null;

    if (!timeRaw || typeof timeRaw !== 'string') {
        return parsed;
    }

    const [h, m] = timeRaw.split(':').map((v) => Number(v));
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return null;
    }

    parsed.setHours(h, m, 0, 0);
    return parsed;
};

const normaliserEntretienSortie = (doc) => {
    const entretien = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
    return {
        ...entretien,
        date_entretien: entretien.date_entretien || entretien.dateEntretien,
        type_entretien: entretien.type_entretien || entretien.typeEntretien,
        score_entretien: entretien.score_entretien !== undefined ? entretien.score_entretien : entretien.scoreEntretien,
        criteres_evaluation: entretien.criteres_evaluation || entretien.criteresEvaluation,
        lien_visio: entretien.lien_visio || entretien.lienVisio,
        candidat_email: entretien.candidat_email || entretien.candidatEmail,
        candidat_nom: entretien.candidat_nom || entretien.candidatNom
    };
};

module.exports.getAllEntretiens = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const entretiens = await entretienModel.find({ entreprise: req.entrepriseId })
            .populate({
                path: 'candidature',
                populate: {
                    path: 'candidat',
                    select: 'nom email telephone cv_url photo_url'
                }
            })
            .populate('responsable', 'nom name email');
        res.status(200).json({ message: 'Entretiens retrieved successfully', data: entretiens.map(normaliserEntretienSortie) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports.getEntretienById = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const entretien = await entretienModel.findOne({ _id: req.params.id, entreprise: req.entrepriseId })
            .populate({
                path: 'candidature',
                populate: {
                    path: 'candidat',
                    select: 'nom email telephone cv_url photo_url'
                }
            })
            .populate('responsable', 'nom name email');
        if (!entretien) {
            return res.status(404).json({ message: "Entretien not found" });
        }
        res.status(200).json({ message: 'Entretien retrieved successfully', data: normaliserEntretienSortie(entretien) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports.createEntretien = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const {
            candidature,
            date_entretien,
            dateEntretien,
            heure_debut,
            heureDebut,
            type_entretien,
            typeEntretien,
            duree,
            lien_visio,
            lienVisio,
            candidat_email,
            candidatEmail,
            email,
            candidat_nom,
            candidatNom,
            nom,
            nom_candidat,
            nomCandidat,
            poste,
            post
        } = req.body;
        const responsableId = req.userId || req.utilisateurId;

        if (!responsableId) {
            return res.status(401).json({ message: "Unauthorized: userId is required" });
        }

        const dateEntretienBrute = dateEntretien !== undefined ? dateEntretien : date_entretien;
        const heureDebutInput = heureDebut !== undefined ? heureDebut : heure_debut;
        const parsedDate = parseDateEntretien(dateEntretienBrute, heureDebutInput);

        if (!parsedDate) {
            return res.status(400).json({ message: "Invalid date format" });
        }

        const candidatEmailInput = (candidatEmail !== undefined ? candidatEmail : (candidat_email !== undefined ? candidat_email : email));
        const candidatNomInput = (candidatNom !== undefined ? candidatNom : (candidat_nom !== undefined ? candidat_nom : (nomCandidat !== undefined ? nomCandidat : (nom_candidat !== undefined ? nom_candidat : nom))));
        const posteInput = poste !== undefined ? poste : post;

        const hasStandaloneIdentity = Boolean(candidatEmailInput && candidatNomInput && posteInput);

        if (!candidature && !hasStandaloneIdentity) {
            return res.status(400).json({
                message: "Provide either candidature or (candidat_email + candidat_nom + poste)"
            });
        }

        let candidatureDoc = null;
        if (candidature) {
            candidatureDoc = await candidatureModel.findOne({ _id: candidature, entreprise: req.entrepriseId });
            if (!candidatureDoc) {
                return res.status(404).json({ message: "Candidature not found" });
            }
        }

        const dureeMinutes = duree || 30;
        const endDate = new Date(parsedDate.getTime() + dureeMinutes * 60000);

        const conflictResponsable = await entretienModel.findOne({
            entreprise: req.entrepriseId,
            responsable: responsableId,
            date_entretien: {
                $gte: new Date(parsedDate.getTime() - dureeMinutes * 60000),
                $lt: endDate
            }
        });
        if (conflictResponsable) {
            return res.status(400).json({ message: "Schedule conflict: the responsable already has an interview at this time" });
        }

        if (candidature) {
            const conflictCandidature = await entretienModel.findOne({
                entreprise: req.entrepriseId,
                candidature,
                date_entretien: {
                    $gte: new Date(parsedDate.getTime() - dureeMinutes * 60000),
                    $lt: endDate
                }
            });
            if (conflictCandidature) {
                return res.status(400).json({ message: "Schedule conflict: this candidature already has an interview at this time" });
            }
        }

        const typeEntretienValue = typeEntretien !== undefined ? typeEntretien : (type_entretien || 'visio');

        const newEntretien = new entretienModel({
            entreprise: req.entrepriseId,
            candidature: candidature || null,
            candidatEmail: candidature ? candidatureDoc?.email : candidatEmailInput,
            candidatNom: candidature ? candidatureDoc?.nom : candidatNomInput,
            poste: candidature ? undefined : posteInput,
            etapeSource: candidature ? (candidatureDoc?.etape || null) : null,
            responsable: responsableId,
            dateEntretien: parsedDate,
            typeEntretien: typeEntretienValue,
            duree: dureeMinutes,
            lienVisio: isVisioType(typeEntretienValue) ? (lienVisio !== undefined ? lienVisio : lien_visio) : undefined
        });

        const savedEntretien = await newEntretien.save();
        let googleWarning;

        try {
            const rhUser = await utilisateurModel.findById(responsableId).select('googleTokens');

            if (!rhUser?.googleTokens) {
                googleWarning = "RH non connecté à Google Calendar. Connectez votre compte Google dans les paramètres.";
            } else if (rhUser?.googleTokens?.refresh_token) {
                const { eventId, meetLink } = await createCalendarEvent({
                    tokens: rhUser.googleTokens,
                    entretien: savedEntretien
                });

                if (isVisioType(savedEntretien.typeEntretien) && meetLink) {
                    savedEntretien.lienVisio = meetLink;
                } else if (!isVisioType(savedEntretien.typeEntretien)) {
                    savedEntretien.lienVisio = undefined;
                }
                savedEntretien.googleEventId = eventId;
                await savedEntretien.save();
            } else {
                googleWarning = "Google Calendar non synchronisé: reconnectez votre compte Google (consentement requis).";
            }
        } catch (googleError) {
            console.error('Google Calendar sync failed:', googleError);
        }

        if (candidatureDoc) {
            candidatureDoc.etape = 'entretien_planifie';
            await candidatureDoc.save();
        }

        const responsePayload = {
            message: 'Entretien created successfully',
            data: normaliserEntretienSortie(savedEntretien)
        };

        if (googleWarning) {
            responsePayload.googleWarning = googleWarning;
        }

        res.status(201).json(responsePayload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports.createEntretienWithOutCondidature = module.exports.createEntretien;

module.exports.updateEntretien = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const entretien = await entretienModel.findOne({ _id: req.params.id, entreprise: req.entrepriseId });
        if (!entretien) {
            return res.status(404).json({ message: "Entretien not found" });
        }

        const {
            commentaires,
            score_entretien,
            scoreEntretien,
            criteres_evaluation,
            criteresEvaluation,
            reponse,
            date_entretien,
            dateEntretien,
            type_entretien,
            typeEntretien,
            duree,
            lien_visio,
            lienVisio
        } = req.body;

        if (commentaires !== undefined) entretien.commentaires = commentaires;
        if (scoreEntretien !== undefined || score_entretien !== undefined) {
            entretien.scoreEntretien = scoreEntretien !== undefined ? scoreEntretien : score_entretien;
        }
        if (criteresEvaluation !== undefined || criteres_evaluation !== undefined) {
            entretien.criteresEvaluation = criteresEvaluation !== undefined ? criteresEvaluation : criteres_evaluation;
        }
        if (dateEntretien !== undefined || date_entretien !== undefined) {
            entretien.dateEntretien = new Date(dateEntretien !== undefined ? dateEntretien : date_entretien);
        }
        if (typeEntretien !== undefined || type_entretien !== undefined) {
            entretien.typeEntretien = typeEntretien !== undefined ? typeEntretien : type_entretien;
        }
        if (duree !== undefined) entretien.duree = duree;
        if (lienVisio !== undefined || lien_visio !== undefined) {
            if (isVisioType(entretien.typeEntretien)) {
                entretien.lienVisio = lienVisio !== undefined ? lienVisio : lien_visio;
            }
        }

        if (!isVisioType(entretien.typeEntretien)) {
            entretien.lienVisio = undefined;
        }

        if (reponse !== undefined) {
            entretien.reponse = reponse;

            const candidature = await candidatureModel.findOne({ _id: entretien.candidature, entreprise: req.entrepriseId });
            if (candidature) {
                if (reponse === 'accepte') {
                    candidature.etape = 'accepte';
                    await candidature.save();
                } else if (reponse === 'refuse') {
                    candidature.etape = 'refuse';
                    await candidature.save();
                }
            }
        }

        await entretien.save();

        let googleWarning;
        if (entretien.googleEventId && entretien.responsable) {
            try {
                const rhUser = await utilisateurModel.findById(entretien.responsable).select('googleTokens');

                if (!rhUser?.googleTokens) {
                    googleWarning = "RH non connecté à Google Calendar. Connectez votre compte Google dans les paramètres.";
                } else if (rhUser?.googleTokens?.refresh_token) {
                    const { meetLink } = await updateCalendarEvent({
                        tokens: rhUser.googleTokens,
                        eventId: entretien.googleEventId,
                        entretien
                    });

                    if (isVisioType(entretien.typeEntretien) && meetLink) {
                        entretien.lienVisio = meetLink;
                        await entretien.save();
                    } else if (!isVisioType(entretien.typeEntretien) && entretien.lienVisio) {
                        entretien.lienVisio = undefined;
                        await entretien.save();
                    }
                } else {
                    googleWarning = "Google Calendar non synchronisé: reconnectez votre compte Google (consentement requis).";
                }
            } catch (googleError) {
                console.error('Google Calendar update failed (non-bloquant):', googleError.message);
            }
        }

        const responsePayload = {
            message: 'Entretien updated successfully',
            data: normaliserEntretienSortie(entretien)
        };

        if (googleWarning) {
            responsePayload.googleWarning = googleWarning;
        }

        res.status(200).json(responsePayload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports.deleteEntretien = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const entretien = await entretienModel.findOne({ _id: req.params.id, entreprise: req.entrepriseId });

        if (!entretien) {
            return res.status(404).json({ message: "Entretien not found" });
        }

        if (entretien.googleEventId && entretien.responsable) {
            try {
                const rhUser = await utilisateurModel.findById(entretien.responsable).select('googleTokens');

                if (rhUser?.googleTokens?.refresh_token) {
                    await deleteCalendarEvent({
                        tokens: rhUser.googleTokens,
                        eventId: entretien.googleEventId
                    });
                }
            } catch (googleError) {
                console.error('Google Calendar delete failed (non-bloquant):', googleError.message);
            }
        }

        await entretienModel.findOneAndDelete({ _id: req.params.id, entreprise: req.entrepriseId });

        if (entretien.candidature) {
            const candidature = await candidatureModel.findOne({
                _id: entretien.candidature,
                entreprise: req.entrepriseId
            });

            if (candidature && candidature.etape === 'entretien_planifie') {
                candidature.etape = entretien.etapeSource || 'preselectionne';
                candidature.dateEntretien = null;
                candidature.typeEntretien = null;
                await candidature.save();
            }
        }

        res.status(200).json({
            message: 'Entretien deleted successfully',
            data: normaliserEntretienSortie(entretien)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
