var express = require('express');
var router = express.Router();
const logMiddleware = require('../middlewares/logMiddlewares');
const offreEmploiController = require('../controllers/offreEmploi.controller');
const requireAuth = require('../middlewares/authMiddleware');
const requireTenant = require('../middlewares/requireTenant');

router.get('/getAllOffres', logMiddleware, offreEmploiController.getAllOffres);
router.get('/getOffresDisponibles', logMiddleware, offreEmploiController.getOffresDisponibles);
router.get('/getOffresByEntreprise', requireAuth, requireTenant, logMiddleware, offreEmploiController.getOffresByEntreprise);
router.get('/getOffresByEntreprise/:entrepriseId', requireAuth, requireTenant, logMiddleware, offreEmploiController.getOffresByEntrepriseId);
router.get('/getOffreById/:id', logMiddleware, offreEmploiController.getOffreById);
router.post('/createOffre', requireAuth, requireTenant, logMiddleware, offreEmploiController.createOffre);
router.put('/updateOffre/:id', requireAuth, requireTenant, logMiddleware, offreEmploiController.updateOffre);
router.put('/updateOffreStatus/:id', requireAuth, requireTenant, logMiddleware, offreEmploiController.updateStatus);
router.delete('/deleteOffreById/:id', requireAuth, requireTenant, logMiddleware, offreEmploiController.deleteOffre);

module.exports = router;
