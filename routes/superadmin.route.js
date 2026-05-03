const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadmin.controller');
const requireAuth = require('../middlewares/authMiddleware');
const requireSuperAdmin = require('../middlewares/requireSuperAdmin');

// All routes require authentication + superadmin role.
router.use(requireAuth, requireSuperAdmin);

// Statistics
router.get('/stats', superadminController.getStats);

// Pending registration requests
router.get('/demandes', superadminController.getDemandesEnAttente);
router.patch('/demandes/:id/accepter', superadminController.accepterEntreprise);
router.patch('/demandes/:id/rejeter', superadminController.rejeterEntreprise);

// Enterprise management
router.get('/entreprises', superadminController.getAllEntreprises);
router.get('/entreprises/:id', superadminController.getEntrepriseDetail);
router.patch('/entreprises/:id/suspendre', superadminController.suspendreEntreprise);
router.patch('/entreprises/:id/reactiver', superadminController.reactiverEntreprise);
router.patch('/entreprises/:id/plan', superadminController.updateEntreprisePlan);
router.delete('/entreprises/:id', superadminController.deleteEntreprise);

// User management (cross-tenant)
router.get('/utilisateurs', superadminController.getAllUtilisateurs);
router.get('/candidats', superadminController.getAllCandidats);
router.patch('/utilisateurs/:id/block', superadminController.toggleBlockUser);
router.delete('/utilisateurs/:id', superadminController.deleteUtilisateur);
router.post('/utilisateurs', superadminController.createAdminForEntreprise);

module.exports = router;
