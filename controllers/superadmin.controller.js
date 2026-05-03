const entrepriseModel = require('../models/entreprise.model');
const utilisateurModel = require('../models/utilisateur.model');
const offreEmploiModel = require('../models/offreEmploi.model');
const candidatureModel = require('../models/candidature.model');
const entretienModel = require('../models/entretien.model');
const candidatModel = require('../models/candidat.model');
const {
  sendEntrepriseValidationEmail,
  sendEntrepriseRejectionEmail
} = require('../utils/mailer');

// ──────────────────────────── Statistiques globales ────────────────────────────

module.exports.getStats = async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [
      totalEntreprises,
      entreprisesActives,
      entreprisesEnAttente,
      entreprisesRejetees,
      entreprisesSuspendues,
      totalUsersRH,
      totalCandidats,
      totalOffres,
      offresActives,
      totalCandidatures,
      nouvellesDemandesCetteSemaine
    ] = await Promise.all([
      entrepriseModel.countDocuments(),
      entrepriseModel.countDocuments({ statut: 'active' }),
      entrepriseModel.countDocuments({ statut: 'en_attente' }),
      entrepriseModel.countDocuments({ statut: 'rejetee' }),
      entrepriseModel.countDocuments({ statut: 'suspendue' }),
      utilisateurModel.countDocuments({ role: { $in: ['admin', 'rh'] } }),
      candidatModel.countDocuments(),
      offreEmploiModel.countDocuments(),
      offreEmploiModel.countDocuments({ statut: 'open' }),
      candidatureModel.countDocuments(),
      entrepriseModel.countDocuments({ dateInscription: { $gte: oneWeekAgo } })
    ]);

    return res.status(200).json({
      totalEntreprises,
      entreprisesActives,
      entreprisesEnAttente,
      entreprisesRejetees,
      entreprisesSuspendues,
      totalUsersRH,
      totalCandidats,
      totalOffres,
      offresActives,
      totalCandidatures,
      nouvellesDemandesCetteSemaine
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', detail: error.message });
  }
};

// ──────────────────────── Demandes d'inscription ──────────────────────────────

module.exports.getDemandesEnAttente = async (req, res) => {
  try {
    const entreprises = await entrepriseModel
      .find({ statut: 'en_attente' })
      .sort({ dateInscription: -1 });

    // For each pending enterprise, find the associated admin user.
    const results = await Promise.all(
      entreprises.map(async (ent) => {
        const admin = await utilisateurModel
          .findOne({ entreprise: ent._id, role: 'admin' })
          .select('-motDePasse');
        return { entreprise: ent, admin };
      })
    );

    return res.status(200).json({ data: results });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des demandes', detail: error.message });
  }
};

module.exports.accepterEntreprise = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.params.id);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    const admin = await utilisateurModel
      .findOne({ entreprise: entreprise._id, role: 'admin' })
      .select('email');

    if (!admin || !admin.email) {
      return res.status(404).json({ message: "Aucun administrateur associé à cette entreprise." });
    }

    entreprise.statut = 'active';
    entreprise.dateValidation = new Date();
    entreprise.validePar = req.utilisateur._id;
    await entreprise.save();

    // Unblock the admin user linked to this enterprise.
    await utilisateurModel.updateMany(
      { entreprise: entreprise._id, role: 'admin' },
      { bloque: false }
    );

    await sendEntrepriseValidationEmail(admin.email, entreprise.nom);

    return res.status(200).json({ message: 'Entreprise validée, compte admin activé et email envoyé.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la validation', detail: error.message });
  }
};

module.exports.rejeterEntreprise = async (req, res) => {
  try {
    const { motif } = req.body;
    if (!motif) {
      return res.status(400).json({ message: 'Le motif de rejet est obligatoire' });
    }

    const entreprise = await entrepriseModel.findById(req.params.id);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    const admin = await utilisateurModel
      .findOne({ entreprise: entreprise._id, role: 'admin' })
      .select('email');

    if (!admin || !admin.email) {
      return res.status(404).json({ message: "Aucun administrateur associé à cette entreprise." });
    }

    entreprise.statut = 'rejetee';
    entreprise.motifRejet = motif;
    entreprise.validePar = req.utilisateur._id;
    await entreprise.save();

    await sendEntrepriseRejectionEmail(admin.email, entreprise.nom, motif);

    return res.status(200).json({ message: 'Entreprise rejetée et email envoyé.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors du rejet', detail: error.message });
  }
};

// ──────────────────────── Gestion des entreprises ─────────────────────────────

module.exports.getAllEntreprises = async (req, res) => {
  try {
    const { statut, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (statut) filter.statut = statut;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    const [entreprises, total] = await Promise.all([
      entrepriseModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      entrepriseModel.countDocuments(filter)
    ]);

    // Aggregate stats for each enterprise.
    const data = await Promise.all(
      entreprises.map(async (ent) => {
        const [nbUsers, nbOffresActives, nbCandidatures] = await Promise.all([
          utilisateurModel.countDocuments({ entreprise: ent._id }),
          offreEmploiModel.countDocuments({ entreprise: ent._id, statut: 'publiée' }),
          candidatureModel.countDocuments({ entreprise: ent._id })
        ]);
        return {
          ...ent.toObject({ virtuals: true }),
          nbUsers,
          nbOffresActives,
          nbCandidatures
        };
      })
    );

    return res.status(200).json({
      data,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des entreprises', detail: error.message });
  }
};

module.exports.getEntrepriseDetail = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.params.id);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    const utilisateurs = await utilisateurModel
      .find({ entreprise: entreprise._id })
      .select('-motDePasse')
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: { entreprise, utilisateurs } });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération du détail', detail: error.message });
  }
};

module.exports.suspendreEntreprise = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.params.id);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    entreprise.statut = 'suspendue';
    await entreprise.save();

    // Block every user of this enterprise.
    await utilisateurModel.updateMany(
      { entreprise: entreprise._id },
      { bloque: true }
    );

    return res.status(200).json({ message: 'Entreprise suspendue avec succès.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la suspension', detail: error.message });
  }
};

module.exports.reactiverEntreprise = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.params.id);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    entreprise.statut = 'active';
    entreprise.dateValidation = new Date();
    await entreprise.save();

    // Unblock every user of this enterprise.
    await utilisateurModel.updateMany(
      { entreprise: entreprise._id },
      { bloque: false }
    );

    return res.status(200).json({ message: 'Entreprise réactivée avec succès.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la réactivation', detail: error.message });
  }
};

module.exports.deleteEntreprise = async (req, res) => {
  try {
    const entrepriseId = req.params.id;

    const deletedEntreprise = await entrepriseModel.findByIdAndDelete(entrepriseId);
    if (!deletedEntreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    // Cascade delete all related data.
    await Promise.all([
      utilisateurModel.deleteMany({ entreprise: entrepriseId }),
      offreEmploiModel.deleteMany({ entreprise: entrepriseId }),
      candidatureModel.deleteMany({ entreprise: entrepriseId }),
      entretienModel.deleteMany({ entreprise: entrepriseId })
    ]);

    return res.status(200).json({ message: 'Entreprise et toutes les données associées supprimées.', data: deletedEntreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la suppression', detail: error.message });
  }
};

module.exports.updateEntreprisePlan = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Plan invalide. Valeurs possibles : free, pro, enterprise' });
    }

    const entreprise = await entrepriseModel.findByIdAndUpdate(
      req.params.id,
      { plan },
      { new: true }
    );
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    return res.status(200).json({ message: 'Plan mis à jour.', data: entreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du plan', detail: error.message });
  }
};

// ──────────────────────── Gestion des utilisateurs ────────────────────────────

module.exports.getAllUtilisateurs = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, entrepriseId } = req.query;
    const filter = { role: { $in: ['admin', 'rh'] } };
    if (role) filter.role = role;
    if (entrepriseId) filter.entreprise = entrepriseId;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    const [utilisateurs, total] = await Promise.all([
      utilisateurModel
        .find(filter)
        .select('-motDePasse')
        .populate('entreprise', 'nom statut')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      utilisateurModel.countDocuments(filter)
    ]);

    return res.status(200).json({
      data: utilisateurs,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs', detail: error.message });
  }
};

module.exports.getAllCandidats = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    const [candidats, total] = await Promise.all([
      candidatModel
        .find({})
        .select('-motDePasse -resetToken -resetTokenExpiry')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      candidatModel.countDocuments({})
    ]);

    return res.status(200).json({
      data: candidats,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des candidats', detail: error.message });
  }
};

module.exports.toggleBlockUser = async (req, res) => {
  try {
    const utilisateur = await utilisateurModel.findById(req.params.id);
    if (!utilisateur) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    utilisateur.bloque = !utilisateur.bloque;
    await utilisateur.save();

    return res.status(200).json({
      message: utilisateur.bloque ? 'Utilisateur bloqué.' : 'Utilisateur débloqué.',
      data: { bloque: utilisateur.bloque }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors du blocage/déblocage', detail: error.message });
  }
};

module.exports.deleteUtilisateur = async (req, res) => {
  try {
    const utilisateur = await utilisateurModel.findById(req.params.id);
    if (!utilisateur) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Prevent deleting the last admin of an enterprise.
    if (utilisateur.role === 'admin' && utilisateur.entreprise) {
      const adminCount = await utilisateurModel.countDocuments({
        entreprise: utilisateur.entreprise,
        role: 'admin'
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Impossible de supprimer le dernier administrateur de l'entreprise."
        });
      }
    }

    await utilisateurModel.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'Utilisateur supprimé.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la suppression', detail: error.message });
  }
};

module.exports.createAdminForEntreprise = async (req, res) => {
  try {
    const { nom, email, password, entrepriseId } = req.body;
    if (!nom || !email || !password || !entrepriseId) {
      return res.status(400).json({ message: 'nom, email, password et entrepriseId sont obligatoires' });
    }

    const entreprise = await entrepriseModel.findById(entrepriseId);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    const existingUser = await utilisateurModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });
    }

    const newAdmin = await utilisateurModel.create({
      nom,
      email,
      motDePasse: password,
      role: 'admin',
      entreprise: entrepriseId,
      bloque: false
    });

    const adminObject = newAdmin.toObject({ virtuals: true });
    delete adminObject.motDePasse;
    delete adminObject.password;

    return res.status(201).json({ message: 'Admin créé avec succès.', data: adminObject });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la création', detail: error.message });
  }
};
