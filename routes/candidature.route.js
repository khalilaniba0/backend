const express = require('express');
const router = express.Router();
const requireAuth = require('../middlewares/authMiddleware');
const requireTenant = require('../middlewares/requireTenant');
const requireCandidat = require('../middlewares/requireCandidat');
const upload = require('../middlewares/uploadfile');
const logMiddleware = require('../middlewares/logMiddlewares');
const {
	postuler,
	mesCandidatures,
	annulerCandidature,
	modifierCandidature,
	getAllCandidatures,
	getCandidatureById,
	getCandidaturesByOffre,
	updateCandidatureEtape,
	refuserCandidature,
	deleteCandidatureById
} = require('../controllers/candidature.controller');

// Protege candidat
router.post('/postuler', requireCandidat, upload.single('cv_url'), logMiddleware, postuler);
router.get('/mesCandidatures', requireCandidat, logMiddleware, mesCandidatures);
router.delete('/annuler/:id', requireCandidat, logMiddleware, annulerCandidature);
router.put('/modifier/:id', requireCandidat, logMiddleware, modifierCandidature);

// Protege RH/Admin
router.get('/getAllCandidatures', requireAuth, requireTenant, logMiddleware, getAllCandidatures);
router.get('/getCandidatureById/:id', requireAuth, requireTenant, logMiddleware, getCandidatureById);
router.get('/getCandidaturesByOffre/:offreId', requireAuth, requireTenant, logMiddleware, getCandidaturesByOffre);
router.put('/updateCandidatureEtape/:id', requireAuth, requireTenant, logMiddleware, updateCandidatureEtape);
router.put('/refuserCandidature/:id', requireAuth, requireTenant, logMiddleware, refuserCandidature);
router.delete('/deleteCandidatureById/:id', requireAuth, requireTenant, logMiddleware, deleteCandidatureById);

module.exports = router;
