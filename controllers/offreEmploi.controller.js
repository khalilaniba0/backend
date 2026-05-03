const offreEmploiModel = require('../models/offreEmploi.model');
const candidatureModel = require('../models/candidature.model');
const { supprimerCandidaturesParOffre } = require('./candidature.controller');
const { processOffer } = require('../utils/iaScoringClient');

const POPULATE_OFFRE_REFS = [
    { path: 'responsable', select: 'nom name email' },
    { path: 'entreprise', select: 'nom logo secteur siteWeb email adresse apropos' }
];

const construireFiltreOffres = (query = {}, entrepriseId = null) => {
    const filter = {};

    if (entrepriseId) {
        filter.entreprise = entrepriseId;
    }

    if (query.typeContrat) filter.typeContrat = query.typeContrat;
    if (query.localisation) filter.localisation = { $regex: query.localisation, $options: 'i' };
    if (query.status || query.statut) filter.statut = query.statut || query.status;
    if (query.departement) filter.departement = { $regex: query.departement, $options: 'i' };
    if (query.modeContrat) filter.modeContrat = query.modeContrat;
    if (query.niveauExperience) filter.niveauExperience = query.niveauExperience;

    return filter;
};

const normaliserOffreSortie = (doc) => {
    const offre = doc.toObject ? doc.toObject({ virtuals: true }) : doc;
    return {
        ...offre,
        post: offre.post || offre.poste,
        status: offre.status || offre.statut,
        requirements: offre.requirements || offre.exigences
    };
};

module.exports.getAllOffres = async (req, res) => {
    try {
        const filter = construireFiltreOffres(req.query);

        const offres = await offreEmploiModel.find(filter).populate(POPULATE_OFFRE_REFS);
        res.status(200).json({ message: 'Offres retrieved successfully', data: offres.map(normaliserOffreSortie) });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving offres', error: error.message });
    }
};

module.exports.getOffresByEntreprise = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const filter = construireFiltreOffres(req.query, req.entrepriseId);
        const offres = await offreEmploiModel.find(filter).populate(POPULATE_OFFRE_REFS);

        return res.status(200).json({
            message: 'Entreprise offres retrieved successfully',
            data: offres.map(normaliserOffreSortie)
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving entreprise offres', error: error.message });
    }
};

module.exports.getOffresByEntrepriseId = async (req, res) => {
    try {
        const entrepriseId = req.params.entrepriseId;
        if (!entrepriseId) {
            return res.status(400).json({ message: "Entreprise ID is required" });
        }

        const filter = construireFiltreOffres(req.query, entrepriseId);
        const offres = await offreEmploiModel.find(filter).populate(POPULATE_OFFRE_REFS);

        return res.status(200).json({
            message: 'Entreprise offres retrieved successfully',
            data: offres.map(normaliserOffreSortie)
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving entreprise offres', error: error.message });
    }
};

module.exports.getOffresDisponibles = async (req, res) => {
    try {
        const filter = construireFiltreOffres(req.query);
        filter.statut = 'open';

        const offres = await offreEmploiModel.find(filter).populate(POPULATE_OFFRE_REFS);
        res.status(200).json({ message: 'Offres disponibles retrieved successfully', data: offres.map(normaliserOffreSortie) });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving offres', error: error.message });
    }
};

module.exports.getOffreById = async (req, res) => {
    try {
        const offreId = req.params.id;
        const offre = await offreEmploiModel.findById(offreId).populate(POPULATE_OFFRE_REFS);
        if (!offre) {
            return res.status(404).json({ message: "Offre not found" });
        }
        res.status(200).json({ message: 'Offre retrieved successfully', data: normaliserOffreSortie(offre) });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving offre', error: error.message });
    }
};

module.exports.createOffre = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const {
            post, poste, description, requirements, exigences, typeContrat, salaireMin, salaireMax,
            localisation, modeContrat, departement, dateLimite, niveauExperience, niveauEducation, langues
        } = req.body;

        const newOffre = new offreEmploiModel({
            poste: poste !== undefined ? poste : post,
            description,
            exigences: exigences !== undefined ? exigences : requirements,
            typeContrat,
            salaireMin,
            salaireMax,
            localisation, modeContrat, departement, dateLimite, niveauExperience, niveauEducation, langues,
            responsable: (req.utilisateur || req.user)._id,
            entreprise: req.entrepriseId
        });
        await newOffre.save();

        // Ne pas bloquer la creation d'offre si l'IA est indisponible.
        (async () => {
            try {
                const processedJobIA = await processOffer(newOffre);
                await offreEmploiModel.findByIdAndUpdate(newOffre._id, {
                    processedJobIA,
                    iaOutOfScope: processedJobIA?.is_it_domain === false
                });
            } catch (iaError) {
                console.error('[IA] process-offer', iaError.message, iaError.details || '');
            }
        })();

        res.status(201).json({ message: 'Offre created successfully', data: normaliserOffreSortie(newOffre) });
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Invalid offre payload', error: error.message });
        }
        res.status(500).json({ message: 'Error creating offre', error: error.message });
    }
};
module.exports.updateOffre = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const offreId = req.params.id;
        const {
            post, poste, description, requirements, exigences, typeContrat, salaireMin, salaireMax,
            localisation, modeContrat, departement, dateLimite, niveauExperience
        } = req.body;

        const updateData = {};
        if (poste !== undefined || post !== undefined) updateData.poste = poste !== undefined ? poste : post;
        if (description !== undefined) updateData.description = description;
        if (exigences !== undefined || requirements !== undefined) {
            updateData.exigences = exigences !== undefined ? exigences : requirements;
        }
        if (typeContrat !== undefined) updateData.typeContrat = typeContrat;
        if (salaireMin !== undefined) updateData.salaireMin = salaireMin;
        if (salaireMax !== undefined) updateData.salaireMax = salaireMax;
        if (localisation !== undefined) updateData.localisation = localisation;
        if (modeContrat !== undefined) updateData.modeContrat = modeContrat;
        if (departement !== undefined) updateData.departement = departement;
        if (dateLimite !== undefined) updateData.dateLimite = dateLimite;
        if (niveauExperience !== undefined) updateData.niveauExperience = niveauExperience;

        const updatedOffre = await offreEmploiModel.findOneAndUpdate(
            { _id: offreId, entreprise: req.entrepriseId },
            updateData,
            { new: true }
        );
        if (!updatedOffre) {
            return res.status(404).json({ message: "Offre not found" });
        }
        res.status(200).json({ message: 'Offre updated successfully', data: normaliserOffreSortie(updatedOffre) });
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Invalid offre payload', error: error.message });
        }
        res.status(500).json({ message: 'Error updating offre', error: error.message });
    }
};

module.exports.deleteOffre = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const offreId = req.params.id;
        const offre = await offreEmploiModel.findOne({ _id: offreId, entreprise: req.entrepriseId });
        if (!offre) {
            return res.status(404).json({ message: "Offre not found" });
        }

        const cascadeResult = await supprimerCandidaturesParOffre(offre._id, req.entrepriseId);

        const remainingCandidatures = await candidatureModel.countDocuments({ offre: offre._id });
        if (remainingCandidatures > 0) {
            return res.status(409).json({
                message: 'Suppression de l offre annulee: des candidatures references existent encore.',
                remainingCandidatures
            });
        }

        await offreEmploiModel.deleteOne({ _id: offre._id, entreprise: req.entrepriseId });

        res.status(200).json({
            message: 'Offre et toutes ses candidatures supprimees avec succes',
            data: normaliserOffreSortie(offre),
            deletedRelations: cascadeResult
        });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting offre', error: error.message });
    }
};

module.exports.updateStatus = async (req, res) => {
    try {
        if (!req.entrepriseId) {
            return res.status(403).json({ message: "Access denied: tenant is required" });
        }

        const offreId = req.params.id;
        const offre = await offreEmploiModel.findOne({ _id: offreId, entreprise: req.entrepriseId });

        if (!offre) {
            return res.status(404).json({ message: "Offre not found" });
        }

        const nouveauStatut = offre.statut === 'closed' ? 'open' : 'closed';
        const updatedOffre = await offreEmploiModel.findOneAndUpdate(
            { _id: offreId, entreprise: req.entrepriseId },
            { statut: nouveauStatut },
            { new: true }
        );

        res.status(200).json({ message: 'Offre status updated successfully', data: normaliserOffreSortie(updatedOffre) });
    } catch (error) {
        res.status(500).json({ message: 'Error updating offre status', error: error.message });
    }
};
