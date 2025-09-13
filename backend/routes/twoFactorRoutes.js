const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { 
  setup2FA, 
  verify2FA, 
  disable2FA, 
  verify2FALogin, 
  generateNewBackupCodes, 
  verifyBackupCode 
} = require('../controllers/twoFactorController');
const { formatValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// @route   POST /api/v1/auth/2fa/setup
// @desc    Setup two-factor authentication
// @access  Private
router.post('/setup', auth, setup2FA);

// @route   POST /api/v1/auth/2fa/verify
// @desc    Verify and enable two-factor authentication
// @access  Private
router.post('/verify', [
  auth,
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('2FA token must be 6 digits')
    .isNumeric()
    .withMessage('2FA token must contain only numbers')
], verify2FA);

// @route   POST /api/v1/auth/2fa/disable
// @desc    Disable two-factor authentication
// @access  Private
router.post('/disable', [
  auth,
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('2FA token must be 6 digits')
    .isNumeric()
    .withMessage('2FA token must contain only numbers')
], disable2FA);

// @route   POST /api/v1/auth/2fa/verify-login
// @desc    Verify 2FA token during login
// @access  Public
router.post('/verify-login', [
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('2FA token must be 6 digits')
    .isNumeric()
    .withMessage('2FA token must contain only numbers')
], verify2FALogin);

// @route   POST /api/v1/auth/2fa/backup-codes
// @desc    Generate new backup codes
// @access  Private
router.post('/backup-codes', [
  auth,
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('2FA token must be 6 digits')
    .isNumeric()
    .withMessage('2FA token must contain only numbers')
], generateNewBackupCodes);

// @route   POST /api/v1/auth/2fa/verify-backup
// @desc    Verify backup code
// @access  Public
router.post('/verify-backup', [
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('backupCode')
    .matches(/^[A-F0-9]{4}-[A-F0-9]{4}$/)
    .withMessage('Invalid backup code format')
], verifyBackupCode);

module.exports = router;