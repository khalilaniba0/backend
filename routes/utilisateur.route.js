var express = require('express');
var router = express.Router();
const utilisateurController = require('../controllers/utilisateur.controller');
const passwordResetController = require('../controllers/passwordReset.controller');
const logMiddleware = require('../middlewares/logMiddlewares');
const requireAuth = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/requireAdmin');
const requireTenant = require('../middlewares/requireTenant');

router.get('/getAllUsers', requireAuth, requireAdmin, requireTenant, logMiddleware, utilisateurController.getAllUsers);
router.get('/getUserById/:id', requireAuth, requireTenant, logMiddleware, utilisateurController.getUserById);

router.post('/createRh', requireAuth, requireAdmin, requireTenant, utilisateurController.createRh); // @deprecated use inviteRh
router.post('/createAdmin', requireAuth, requireAdmin, requireTenant, utilisateurController.createAdmin);

// Nouveaux flux
router.post('/inviteRh', requireAuth, requireAdmin, requireTenant, utilisateurController.inviteRh);
router.get('/checkInvitation/:token', utilisateurController.checkInvitation);
router.post('/acceptInvitation/:token', utilisateurController.acceptInvitation);
router.put('/completeSetup', requireAuth, requireTenant, utilisateurController.completeSetup);


router.delete('/deleteUser/:id', requireAuth, requireAdmin, requireTenant, utilisateurController.deleteUser);

router.put('/updateUser/:id', requireAuth, requireTenant, utilisateurController.updateUser);
router.put('/updateMyProfile', requireAuth, requireTenant, utilisateurController.updateMyProfile);
router.put('/changePassword', requireAuth, requireTenant, utilisateurController.changePassword);
router.post('/login', utilisateurController.login);
router.post('/forgot-password', passwordResetController.forgotPasswordRH);
router.post('/reset-password/:token', passwordResetController.resetPasswordRH);
router.post('/logout', requireAuth, utilisateurController.logout);

module.exports = router;
