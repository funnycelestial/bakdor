// controllers/twoFactorController.js
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/userModel');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// @route   POST /api/v1/auth/2fa/setup
// @desc    Setup two-factor authentication
// @access  Private
const setup2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      data: null
    });
  }

  if (user.security.twoFactorEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Two-factor authentication is already enabled',
      data: null
    });
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `The Backdoor (${user.anonymousId})`,
    issuer: 'Anonymous Auction Platform',
    length: 32
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  // Temporarily store secret (will be confirmed in verify step)
  user.security.twoFactorSecret = secret.base32;
  await user.save();

  logger.security('2fa_setup_initiated', {
    userId: user._id,
    anonymousId: user.anonymousId
  });

  res.json({
    success: true,
    message: '2FA setup initiated',
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32,
      backupCodes: generateBackupCodes() // Generate backup codes
    }
  });
});

// @route   POST /api/v1/auth/2fa/verify
// @desc    Verify and enable two-factor authentication
// @access  Private
const verify2FA = asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token || token.length !== 6) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token format',
      data: null
    });
  }

  const user = await User.findById(req.user.userId);
  
  if (!user || !user.security.twoFactorSecret) {
    return res.status(400).json({
      success: false,
      message: 'No 2FA setup in progress',
      data: null
    });
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: user.security.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2 // Allow 2 time steps (60 seconds) of variance
  });

  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token',
      data: null
    });
  }

  // Enable 2FA
  user.security.twoFactorEnabled = true;
  await user.save();

  logger.security('2fa_enabled', {
    userId: user._id,
    anonymousId: user.anonymousId
  });

  res.json({
    success: true,
    message: 'Two-factor authentication enabled successfully',
    data: null
  });
});

// @route   POST /api/v1/auth/2fa/disable
// @desc    Disable two-factor authentication
// @access  Private
const disable2FA = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || token.length !== 6) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token format',
      data: null
    });
  }

  const user = await User.findById(req.user.userId);
  
  if (!user || !user.security.twoFactorEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Two-factor authentication is not enabled',
      data: null
    });
  }

  // Verify current token before disabling
  const verified = speakeasy.totp.verify({
    secret: user.security.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2
  });

  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token',
      data: null
    });
  }

  // Disable 2FA
  user.security.twoFactorEnabled = false;
  user.security.twoFactorSecret = undefined;
  await user.save();

  logger.security('2fa_disabled', {
    userId: user._id,
    anonymousId: user.anonymousId
  });

  res.json({
    success: true,
    message: 'Two-factor authentication disabled successfully',
    data: null
  });
});

// @route   POST /api/v1/auth/2fa/verify-login
// @desc    Verify 2FA token during login
// @access  Public
const verify2FALogin = asyncHandler(async (req, res) => {
  const { userId, token } = req.body;
  
  if (!token || token.length !== 6) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token format',
      data: null
    });
  }

  const user = await User.findById(userId);
  
  if (!user || !user.security.twoFactorEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Two-factor authentication not enabled for this user',
      data: null
    });
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: user.security.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2
  });

  if (!verified) {
    // Increment failed attempts
    await user.incLoginAttempts();
    
    logger.security('2fa_verification_failed', {
      userId: user._id,
      anonymousId: user.anonymousId,
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token',
      data: null
    });
  }

  logger.security('2fa_verification_success', {
    userId: user._id,
    anonymousId: user.anonymousId
  });

  res.json({
    success: true,
    message: '2FA verification successful',
    data: { verified: true }
  });
});

// @route   POST /api/v1/auth/2fa/backup-codes
// @desc    Generate new backup codes
// @access  Private
const generateNewBackupCodes = asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  const user = await User.findById(req.user.userId);
  
  if (!user || !user.security.twoFactorEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Two-factor authentication not enabled',
      data: null
    });
  }

  // Verify current token
  const verified = speakeasy.totp.verify({
    secret: user.security.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2
  });

  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA token',
      data: null
    });
  }

  const backupCodes = generateBackupCodes();
  
  // Store hashed backup codes
  user.security.backupCodes = backupCodes.map(code => 
    require('bcryptjs').hashSync(code, 10)
  );
  await user.save();

  logger.security('backup_codes_generated', {
    userId: user._id,
    anonymousId: user.anonymousId
  });

  res.json({
    success: true,
    message: 'New backup codes generated',
    data: { backupCodes }
  });
});

// Helper function to generate backup codes
function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
}

// @route   POST /api/v1/auth/2fa/verify-backup
// @desc    Verify backup code
// @access  Public
const verifyBackupCode = asyncHandler(async (req, res) => {
  const { userId, backupCode } = req.body;
  
  const user = await User.findById(userId);
  
  if (!user || !user.security.twoFactorEnabled || !user.security.backupCodes) {
    return res.status(400).json({
      success: false,
      message: 'Invalid backup code verification request',
      data: null
    });
  }

  // Check backup codes
  let codeValid = false;
  let usedCodeIndex = -1;

  for (let i = 0; i < user.security.backupCodes.length; i++) {
    if (require('bcryptjs').compareSync(backupCode, user.security.backupCodes[i])) {
      codeValid = true;
      usedCodeIndex = i;
      break;
    }
  }

  if (!codeValid) {
    logger.security('backup_code_verification_failed', {
      userId: user._id,
      anonymousId: user.anonymousId,
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid backup code',
      data: null
    });
  }

  // Remove used backup code
  user.security.backupCodes.splice(usedCodeIndex, 1);
  await user.save();

  logger.security('backup_code_used', {
    userId: user._id,
    anonymousId: user.anonymousId,
    remainingCodes: user.security.backupCodes.length
  });

  res.json({
    success: true,
    message: 'Backup code verified successfully',
    data: { 
      verified: true,
      remainingBackupCodes: user.security.backupCodes.length
    }
  });
});

module.exports = {
  setup2FA,
  verify2FA,
  disable2FA,
  verify2FALogin,
  generateNewBackupCodes,
  verifyBackupCode
};