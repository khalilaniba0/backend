const express = require('express');
const router = express.Router();
const logMiddleware = require('../middlewares/logMiddlewares');
const entrepriseController = require('../controllers/entreprise.controller');
const requireAuth = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/requireAdmin');
const requireTenant = require('../middlewares/requireTenant');
const uploadLogo = require('../middlewares/uploadLogo');

router.post('/registerEntreprise', logMiddleware, entrepriseController.registerEntreprise);
router.get('/getMyEntreprise', requireAuth, requireAdmin, requireTenant, logMiddleware, entrepriseController.getMyEntreprise);
router.put('/updateEntreprise', requireAuth, requireAdmin, requireTenant, uploadLogo.single('logo'), logMiddleware, entrepriseController.updateEntreprise);
router.delete('/deleteEntreprise', requireAuth, requireAdmin, requireTenant, logMiddleware, entrepriseController.deleteEntreprise);
router.get('/:id/public', logMiddleware, entrepriseController.getPublicEntreprise);

module.exports = router;

