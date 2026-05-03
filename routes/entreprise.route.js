const express = require('express');
const router = express.Router();
const entrepriseController = require('../controllers/entreprise.controller');
const requireAuth = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/requireAdmin');
const requireTenant = require('../middlewares/requireTenant');
const uploadLogo = require('../middlewares/uploadLogo');

router.post('/registerEntreprise', entrepriseController.registerEntreprise);
router.get('/getMyEntreprise', requireAuth, requireAdmin, requireTenant, entrepriseController.getMyEntreprise);
router.put('/updateEntreprise', requireAuth, requireAdmin, requireTenant, uploadLogo.single('logo'), entrepriseController.updateEntreprise);
router.delete('/deleteEntreprise', requireAuth, requireAdmin, requireTenant, entrepriseController.deleteEntreprise);
router.get('/:id/public', entrepriseController.getPublicEntreprise);

module.exports = router;

