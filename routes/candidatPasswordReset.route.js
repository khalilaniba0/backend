const express = require('express');
const router = express.Router();
const passwordResetController = require('../controllers/passwordReset.controller');

router.post('/forgot-password', passwordResetController.forgotPasswordCandidat);
router.post('/reset-password/:token', passwordResetController.resetPasswordCandidat);

module.exports = router;
