const express = require('express');
const router = express.Router();
const requireCandidat = require('../middlewares/requireCandidat');
const uploadProfileAndCv = require('../middlewares/uploadProfileAndCv');
const {
  inscrire,
  connecter,
  deconnecter,
  monProfil,
  mettreAJourProfil
} = require('../controllers/candidat.controller');

// Public
router.post('/inscrire', inscrire);
router.post('/connecter', connecter);

// Protege candidat
router.post('/deconnecter', requireCandidat, deconnecter);
router.get('/monProfil', requireCandidat, monProfil);
router.put('/mettreAJourProfil', requireCandidat, uploadProfileAndCv.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cv_url', maxCount: 1 }
]), mettreAJourProfil);

module.exports = router;