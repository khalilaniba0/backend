const jwt = require("jsonwebtoken");
const utilisateurModel = require('../models/utilisateur.model');
const entrepriseModel = require('../models/entreprise.model');
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    jwt.verify(token, JWT_SECRET, async (err, decodedToken) => {
      if (err) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      } else {
        const utilisateurId = decodedToken.utilisateurId || decodedToken.userId || decodedToken.id;
        const utilisateur = await utilisateurModel.findById(utilisateurId);
        if (!utilisateur) {
          return res
            .status(401)
            .json({ error: "Unauthorized: User not found" });
        }

        req.utilisateur = utilisateur;
        req.utilisateurId = decodedToken.utilisateurId || decodedToken.userId || decodedToken.id || utilisateur._id.toString();
        req.role = decodedToken.role || utilisateur.role;
        req.entrepriseId = decodedToken.entrepriseId || (utilisateur.entreprise ? utilisateur.entreprise.toString() : null);

        // Compatibilite descendante
        req.user = utilisateur;
        req.userId = req.utilisateurId;

        // Superadmin bypasses enterprise status checks (no entrepriseId).
        if (utilisateur.role !== 'superadmin' && utilisateur.entreprise) {
          const entreprise = await entrepriseModel.findById(utilisateur.entreprise);
          if (entreprise) {
            if (entreprise.statut === 'en_attente') {
              return res.status(403).json({
                message: "Votre compte est en attente de validation par l'administrateur de la plateforme."
              });
            }
            if (entreprise.statut === 'rejetee') {
              return res.status(403).json({
                message: `Votre demande d'inscription a été refusée. Motif : ${entreprise.motifRejet || 'Non précisé'}`
              });
            }
            if (entreprise.statut === 'suspendue') {
              return res.status(403).json({
                message: "Votre compte entreprise a été suspendu. Contactez le support."
              });
            }
          }
        }

        next();
      }
    });
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

module.exports = requireAuth;