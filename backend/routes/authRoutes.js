const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const User = require('../models/userModel');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

const router = express.Router();

// Helper function to generate anonymous ID
const generateAnonymousId = async () => {
  let anonymousId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    anonymousId = `USER_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingUser = await User.findOne({ anonymousId });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return anonymousId;
};

// Helper function to verify wallet signature
const verifyWalletSignature = (message, signature, walletAddress) => {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    logger.error('Error verifying wallet signature:', error);
    return false;
  }
};

// @route   POST /api/v1/auth/register
// @desc    Register user with wallet
// @access  Public
router.post('/register', [
  body('walletAddress')
    .isLength({ min: 42, max: 42 })
    .withMessage('Invalid wallet address format'),
  body('signature')
    .notEmpty()
    .withMessage('Signature is required'),
  body('message')
    .notEmpty()
    .withMessage('Message is required'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { walletAddress, signature, message, email } = req.body;

    // Verify wallet signature
    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet signature',
        data: null
      });
    }

    // Check if user already exists
    const existingUser = await User.findByWallet(walletAddress);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this wallet address',
        data: null
      });
    }

    // Generate anonymous ID
    const anonymousId = await generateAnonymousId();

    // Create new user
    const user = new User({
      walletAddress: walletAddress.toLowerCase(),
      anonymousId,
      email: email?.toLowerCase(),
      lastActivity: new Date()
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' }
    );

    logger.info(`New user registered: ${user.anonymousId}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          profile: user.profile,
          status: user.status,
          createdAt: user.createdAt
        },
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/login
// @desc    Login user with wallet
// @access  Public
router.post('/login', [
  body('walletAddress')
    .isLength({ min: 42, max: 42 })
    .withMessage('Invalid wallet address format'),
  body('signature')
    .notEmpty()
    .withMessage('Signature is required'),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { walletAddress, signature, message, twoFactorToken } = req.body;

    // Verify wallet signature
    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet signature',
        data: null
      });
    }

    // Find user
    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed attempts',
        data: null
      });
    }

    // Check account status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}`,
        data: null
      });
    }

    // Check 2FA if enabled
    if (user.security.twoFactorEnabled) {
      if (!twoFactorToken) {
        return res.status(400).json({
          success: false,
          message: 'Two-factor authentication token required',
          data: { requiresTwoFactor: true }
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.security.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorToken,
        window: 2
      });

      if (!verified) {
        await user.incLoginAttempts();
        return res.status(400).json({
          success: false,
          message: 'Invalid two-factor authentication token',
          data: null
        });
      }
    }

    // Update last login and reset login attempts
    user.security.lastLogin = new Date();
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
    user.lastActivity = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' }
    );

    logger.info(`User logged in: ${user.anonymousId}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          profile: user.profile,
          status: user.status,
          lastLogin: user.security.lastLogin
        },
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive',
        data: null
      });
    }

    // Generate new access token
    const newToken = jwt.sign(
      { 
        userId: user._id,
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      data: null
    });
  }
});

// @route   GET /api/v1/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-security.twoFactorSecret');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          profile: user.profile,
          privacy: user.privacy,
          preferences: user.preferences,
          status: user.status,
          security: {
            twoFactorEnabled: user.security.twoFactorEnabled,
            lastLogin: user.security.lastLogin
          },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   PUT /api/v1/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email format'),
  body('preferences.language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de'])
    .withMessage('Invalid language'),
  body('preferences.timezone')
    .optional()
    .isString()
    .withMessage('Invalid timezone')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        data: null
      });
    }

    const { email, privacy, preferences } = req.body;

    // Update allowed fields
    if (email !== undefined) {
      user.email = email.toLowerCase();
      user.isEmailVerified = false; // Reset verification if email changed
    }

    if (privacy) {
      user.privacy = { ...user.privacy, ...privacy };
    }

    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    await user.save();

    logger.info(`Profile updated for user: ${user.anonymousId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          profile: user.profile,
          privacy: user.privacy,
          preferences: user.preferences,
          updatedAt: user.updatedAt
        }
      }
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // In a more sophisticated implementation, you might want to blacklist the token
    // For now, we'll just log the logout event
    
    logger.info(`User logged out: ${req.user.anonymousId}`);

    res.json({
      success: true,
      message: 'Logout successful',
      data: null
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/enable-2fa
// @desc    Enable two-factor authentication
// @access  Private
router.post('/enable-2fa', auth, async (req, res) => {
  try {
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
      name: `Auction Platform (${user.anonymousId})`,
      issuer: 'Anonymous Auction Platform'
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Save secret (temporarily, until verified)
    user.security.twoFactorSecret = secret.base32;
    await user.save();

    res.json({
      success: true,
      message: '2FA setup initiated',
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32
      }
    });

  } catch (error) {
    logger.error('Enable 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/verify-2fa
// @desc    Verify and enable two-factor authentication
// @access  Private
router.post('/verify-2fa', [
  auth,
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('Invalid 2FA token format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { token } = req.body;
    
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
      window: 2
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

    logger.info(`2FA enabled for user: ${user.anonymousId}`);

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      data: null
    });

  } catch (error) {
    logger.error('Verify 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

// @route   POST /api/v1/auth/disable-2fa
// @desc    Disable two-factor authentication
// @access  Private
router.post('/disable-2fa', [
  auth,
  body('token')
    .isLength({ min: 6, max: 6 })
    .withMessage('Invalid 2FA token format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { token } = req.body;
    
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

    logger.info(`2FA disabled for user: ${user.anonymousId}`);

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully',
      data: null
    });

  } catch (error) {
    logger.error('Disable 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null
    });
  }
});

module.exports = router;