const crypto = require('crypto');
const Utilisateur = require('../models/utilisateur.model');
const Candidat = require('../models/candidat.model');
const { sendPasswordResetEmail } = require('../utils/mailer');

const TOKEN_EXPIRATION_MS = 60 * 60 * 1000;
const MESSAGE_FORGOT_SENT = 'Lien de reinitialisation envoye.';
const MESSAGE_EMAIL_NOT_FOUND = 'Cet email n\'existe pas.';

function normaliserEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hacherToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function construireResetUrl(pathPrefix, token) {
  const baseUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}${pathPrefix}/${token}`;
}

function extraireMotDePasse(body = {}) {
  return body.password || body.motDePasse;
}

async function executerForgotPassword(model, email, pathPrefix) {
  if (!email) {
    return false;
  }

  const compte = await model.findOne({ email });
  if (!compte) {
    return false;
  }

  const token = crypto.randomBytes(32).toString('hex');
  compte.resetToken = hacherToken(token);
  compte.resetTokenExpiry = new Date(Date.now() + TOKEN_EXPIRATION_MS);
  await compte.save();

  const resetUrl = construireResetUrl(pathPrefix, token);
  try {
    await sendPasswordResetEmail(compte.email, resetUrl);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    console.warn('[password-reset] Echec envoi email en local, la requete reste valide.');
    console.warn(`[password-reset] Detail: ${error.message}`);
    console.info(`[password-reset] Lien de secours: ${resetUrl}`);
  }

  return true;
}

async function executerResetPassword(model, token, password) {
  const tokenHache = hacherToken(token);

  const compte = await model.findOne({
    resetToken: tokenHache,
    resetTokenExpiry: { $gt: new Date() }
  });

  if (!compte) {
    return null;
  }

  compte.motDePasse = password;
  compte.resetToken = null;
  compte.resetTokenExpiry = null;
  await compte.save();

  return compte;
}

module.exports.forgotPasswordRH = async (req, res) => {
  try {
    const email = normaliserEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: 'Email requis.' });
    }

    const emailEnvoye = await executerForgotPassword(Utilisateur, email, '/reset-password');

    if (!emailEnvoye) {
      return res.status(404).json({ message: MESSAGE_EMAIL_NOT_FOUND });
    }

    return res.status(200).json({ message: MESSAGE_FORGOT_SENT });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la demande de reinitialisation.', detail: error.message });
  }
};

module.exports.resetPasswordRH = async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim();
    const password = extraireMotDePasse(req.body);

    if (!token || !password) {
      return res.status(400).json({ message: 'Token et mot de passe sont requis.' });
    }

    const compte = await executerResetPassword(Utilisateur, token, password);

    if (!compte) {
      return res.status(400).json({ message: 'Token invalide ou expire' });
    }

    return res.status(200).json({ message: 'Mot de passe reinitialise avec succes.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la reinitialisation du mot de passe.', detail: error.message });
  }
};

module.exports.forgotPasswordCandidat = async (req, res) => {
  try {
    const email = normaliserEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: 'Email requis.' });
    }

    const emailEnvoye = await executerForgotPassword(Candidat, email, '/candidat/reset-password');

    if (!emailEnvoye) {
      return res.status(404).json({ message: MESSAGE_EMAIL_NOT_FOUND });
    }

    return res.status(200).json({ message: MESSAGE_FORGOT_SENT });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la demande de reinitialisation.', detail: error.message });
  }
};

module.exports.resetPasswordCandidat = async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim();
    const password = extraireMotDePasse(req.body);

    if (!token || !password) {
      return res.status(400).json({ message: 'Token et mot de passe sont requis.' });
    }

    const compte = await executerResetPassword(Candidat, token, password);

    if (!compte) {
      return res.status(400).json({ message: 'Token invalide ou expire' });
    }

    return res.status(200).json({ message: 'Mot de passe reinitialise avec succes.' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la reinitialisation du mot de passe.', detail: error.message });
  }
};
