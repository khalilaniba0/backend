const express = require('express');
const router = express.Router();
const logMiddleware = require('../middlewares/logMiddlewares');
const entretienController = require('../controllers/entretien.controller');
const requireAuth = require('../middlewares/authMiddleware');
const requireTenant = require('../middlewares/requireTenant');

router.get('/getAllEntretiens', requireAuth, requireTenant, logMiddleware, entretienController.getAllEntretiens);
router.get('/getEntretienById/:id', requireAuth, requireTenant, logMiddleware, entretienController.getEntretienById);
router.post('/createEntretien', requireAuth, requireTenant, logMiddleware, entretienController.createEntretien);
router.put('/updateEntretien/:id', requireAuth, requireTenant, logMiddleware, entretienController.updateEntretien);
router.delete('/deleteEntretienById/:id', requireAuth, requireTenant, logMiddleware, entretienController.deleteEntretien);

module.exports = router;
