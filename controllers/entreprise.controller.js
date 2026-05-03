const entrepriseModel = require('../models/entreprise.model');
const utilisateurModel = require('../models/utilisateur.model');
const offreEmploiModel = require('../models/offreEmploi.model');
const candidatureModel = require('../models/candidature.model');
const entretienModel = require('../models/entretien.model');

module.exports.registerEntreprise = async (req, res) => {
  try {
    const {
      nom,
      email,
      adresse,
      secteur,
      logo,
      siteWeb,
      plan,
      adminName,
      adminEmail,
      adminPassword,
      adminTel,
      adminPhoto,
      adminAdresse,
      admin
    } = req.body;

    const resolvedAdminName = adminName || (admin && (admin.nom || admin.name));
    const resolvedAdminEmail = adminEmail || (admin && admin.email);
    const resolvedAdminPassword = adminPassword || (admin && (admin.motDePasse || admin.password));
    const resolvedAdminTel = adminTel || (admin && admin.tel);
    const resolvedAdminPhoto = adminPhoto || (admin && admin.photo);
    const resolvedAdminAdresse = adminAdresse || (admin && admin.adresse);

    if (!nom || !email || !resolvedAdminName || !resolvedAdminEmail || !resolvedAdminPassword) {
      return res.status(400).json({
        message: 'nom, email, adminName, adminEmail and adminPassword are required'
      });
    }

    // Enterprise starts in "en_attente" — superadmin must approve it.
    const entreprise = await entrepriseModel.create({
      nom,
      email,
      adresse,
      secteur,
      logo,
      siteWeb,
      plan,
      statut: 'en_attente',
      dateInscription: new Date()
    });

    try {
      // Admin user is blocked until the enterprise is validated.
      const adminUser = await utilisateurModel.create({
        nom: resolvedAdminName,
        email: resolvedAdminEmail,
        motDePasse: resolvedAdminPassword,
        role: 'admin',
        tel: resolvedAdminTel,
        photo: resolvedAdminPhoto,
        adresse: resolvedAdminAdresse,
        entreprise: entreprise._id,
        bloque: true
      });

      const adminObject = adminUser.toObject({ virtuals: true });
      delete adminObject.motDePasse;
      delete adminObject.password;

      return res.status(201).json({
        message: "Votre demande d'inscription a bien été reçue. Elle est en attente de validation par notre équipe.",
        data: {
          entreprise,
          admin: adminObject
        }
      });
    } catch (adminError) {
      await entrepriseModel.findByIdAndDelete(entreprise._id);
      throw adminError;
    }
  } catch (error) {
    return res.status(500).json({ message: 'Error registering entreprise', detail: error.message });
  }
};

module.exports.getMyEntreprise = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.entrepriseId);
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise not found' });
    }
    return res.status(200).json({ message: 'Entreprise retrieved successfully', data: entreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Error retrieving entreprise', detail: error.message });
  }
};

module.exports.updateEntreprise = async (req, res) => {
  try {
    const { nom, email, adresse, secteur, logo, siteWeb, plan, apropos } = req.body;
    const updateData = {};
    if (nom !== undefined) updateData.nom = nom;
    if (email !== undefined) updateData.email = email;
    if (adresse !== undefined) updateData.adresse = adresse;
    if (secteur !== undefined) updateData.secteur = secteur;
    if (logo !== undefined) updateData.logo = logo;
    if (req.file) updateData.logo = `/logo/${req.file.filename}`;
    if (siteWeb !== undefined) updateData.siteWeb = siteWeb;
    if (plan !== undefined) updateData.plan = plan;
    if (apropos !== undefined) updateData.apropos = apropos;

    const updatedEntreprise = await entrepriseModel.findByIdAndUpdate(req.entrepriseId, updateData, { new: true });
    if (!updatedEntreprise) {
      return res.status(404).json({ message: 'Entreprise not found' });
    }
    return res.status(200).json({ message: 'Entreprise updated successfully', data: updatedEntreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating entreprise', detail: error.message });
  }
};

module.exports.deleteEntreprise = async (req, res) => {
  try {
    const entrepriseId = req.entrepriseId;

    const deletedEntreprise = await entrepriseModel.findByIdAndDelete(entrepriseId);
    if (!deletedEntreprise) {
      return res.status(404).json({ message: 'Entreprise not found' });
    }

    await Promise.all([
      utilisateurModel.deleteMany({ entreprise: entrepriseId }),
      offreEmploiModel.deleteMany({ entreprise: entrepriseId }),
      candidatureModel.deleteMany({ entreprise: entrepriseId }),
      entretienModel.deleteMany({ entreprise: entrepriseId })
    ]);

    return res.status(200).json({ message: 'Entreprise deleted successfully', data: deletedEntreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting entreprise', detail: error.message });
  }
};

module.exports.getPublicEntreprise = async (req, res) => {
  try {
    const entreprise = await entrepriseModel.findById(req.params.id)
      .select('nom logo siteWeb email adresse apropos');
    if (!entreprise) {
      return res.status(404).json({ message: 'Entreprise not found' });
    }
    return res.status(200).json({ message: 'Entreprise retrieved successfully', data: entreprise });
  } catch (error) {
    return res.status(500).json({ message: 'Error retrieving entreprise', detail: error.message });
  }
};
