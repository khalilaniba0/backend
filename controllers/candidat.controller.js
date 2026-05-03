const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const Candidat = require('../models/candidat.model');

const COOKIE_MAX_AGE =  24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production';
const CANDIDAT_JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
const COOKIE_SAME_SITE = isProduction ? 'None' : 'Lax';
const CANDIDAT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  maxAge: COOKIE_MAX_AGE,
  sameSite: COOKIE_SAME_SITE
};
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  maxAge: 1,
  sameSite: COOKIE_SAME_SITE
};

const createCandidatToken = (candidat) => {
  if (!CANDIDAT_JWT_SECRET) {
    throw new Error('JWT secret is not configured');
  }

  return jwt.sign(
    { candidatId: candidat._id, type: 'candidat' },
    CANDIDAT_JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const supprimerAncienCvLocal = async (cvUrl) => {
  if (!cvUrl || typeof cvUrl !== 'string' || cvUrl.includes('://')) {
    return;
  }

  const nomFichier = path.basename(cvUrl);
  if (nomFichier !== cvUrl) {
    return;
  }

  const cheminFichier = path.join(__dirname, '..', 'public', 'cv', nomFichier);

  try {
    await fs.promises.unlink(cheminFichier);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Impossible de supprimer l'ancien CV ${nomFichier}:`, error.message);
    }
  }
};

const supprimerAnciennePhotoLocal = async (photoUrl) => {
  if (!photoUrl || typeof photoUrl !== 'string' || photoUrl.includes('://')) {
    return;
  }

  const nomFichier = path.basename(photoUrl);
  if (nomFichier !== photoUrl) {
    return;
  }

  const cheminFichier = path.join(__dirname, '..', 'public', 'profile-photos', nomFichier);

  try {
    await fs.promises.unlink(cheminFichier);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Impossible de supprimer l'ancienne photo ${nomFichier}:`, error.message);
    }
  }
};

module.exports.inscrire = async (req, res) => {
  try {
    const { nom, email, motDePasse, telephone } = req.body;

    if (!nom || !email || !motDePasse) {
      return res.status(400).json({ message: 'nom, email et motDePasse sont requis.' });
    }

    const emailNormalise = email.toLowerCase();
    const existe = await Candidat.findOne({ email: emailNormalise });
    if (existe) {
      return res.status(400).json({ message: 'Cet email est deja utilise.' });
    }

    const candidat = await Candidat.create({ nom, email: emailNormalise, motDePasse, telephone });
    const token = createCandidatToken(candidat);

    // Session unique: se connecter en candidat invalide la session RH/Admin.
    res.cookie('jwt', '', CLEAR_COOKIE_OPTIONS);
    res.cookie('jwt_candidat', token, CANDIDAT_COOKIE_OPTIONS);

    return res.status(201).json({
      message: 'Inscription candidat reussie.',
      data: {
        _id: candidat._id,
        nom: candidat.nom,
        email: candidat.email,
        telephone: candidat.telephone,
        cv_url: candidat.cv_url,
        portfolio_url: candidat.portfolio_url,
        photo_url: candidat.photo_url
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports.connecter = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({ message: 'email et motDePasse sont requis.' });
    }

    const candidat = await Candidat.findOne({ email: email.toLowerCase() });
    if (!candidat) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    const motDePasseValide = await candidat.verifierMotDePasse(motDePasse);
    if (!motDePasseValide) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    const token = createCandidatToken(candidat);

    // Session unique: se connecter en candidat invalide la session RH/Admin.
    res.cookie('jwt', '', CLEAR_COOKIE_OPTIONS);
    res.cookie('jwt_candidat', token, CANDIDAT_COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Connexion candidat reussie.',
      data: {
        _id: candidat._id,
        nom: candidat.nom,
        email: candidat.email,
        telephone: candidat.telephone,
        cv_url: candidat.cv_url,
        portfolio_url: candidat.portfolio_url,
        photo_url: candidat.photo_url
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports.deconnecter = async (req, res) => {
  try {
    res.cookie('jwt_candidat', '', CLEAR_COOKIE_OPTIONS);
    return res.status(200).json({ message: 'Deconnexion candidat reussie.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports.monProfil = async (req, res) => {
  try {
    const candidat = await Candidat.findById(req.candidatId).select('-motDePasse');
    if (!candidat) {
      return res.status(404).json({ message: 'Candidat introuvable.' });
    }

    return res.status(200).json({ message: 'Profil candidat recupere.', data: candidat });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports.mettreAJourProfil = async (req, res) => {
  try {
    const candidatActuel = await Candidat.findById(req.candidatId).select('cv_url photo_url');
    if (!candidatActuel) {
      return res.status(404).json({ message: 'Candidat introuvable.' });
    }

    const updateData = {};
    const protectedFields = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'motDePasse', 'email']);
    const editableFields = Object.keys(Candidat.schema.paths).filter((field) => !protectedFields.has(field));

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const payloadAliases = {
      cvUrl: 'cv_url',
      portfolioUrl: 'portfolio_url'
    };

    for (const [incomingField, targetField] of Object.entries(payloadAliases)) {
      if (req.body[incomingField] !== undefined && updateData[targetField] === undefined) {
        updateData[targetField] = req.body[incomingField];
      }
    }

    // Handle file uploads from .fields() middleware
    if (req.files) {
      if (req.files.cv_url && req.files.cv_url[0]) {
        updateData.cv_url = req.files.cv_url[0].filename;
      }
      if (req.files.photo && req.files.photo[0]) {
        updateData.photo_url = req.files.photo[0].filename;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnee a mettre a jour.' });
    }

    const candidat = await Candidat.findByIdAndUpdate(
      req.candidatId,
      updateData,
      { new: true, runValidators: true }
    )
      .select('-motDePasse');

    // Handle CV file deletion
    const ancienCv = candidatActuel.cv_url;
    const nouveauCv = updateData.cv_url;

    if (nouveauCv !== undefined && ancienCv && ancienCv !== nouveauCv) {
      await supprimerAncienCvLocal(ancienCv);
    }

    // Handle profile photo file deletion
    const anciennePhoto = candidatActuel.photo_url;
    const nouvellePhoto = updateData.photo_url;

    if (nouvellePhoto !== undefined && anciennePhoto && anciennePhoto !== nouvellePhoto) {
      await supprimerAnciennePhotoLocal(anciennePhoto);
    }

    return res.status(200).json({ message: 'Profil candidat mis a jour.', data: candidat });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};