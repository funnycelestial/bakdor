const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const User = require('../models/userModel');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// Security Event model (simplified)
const SecurityEventSchema = require('mongoose').Schema({
  eventId: { type: String, required: true, unique: true },
  user: {
    userId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    anonymousId: String,
    walletAddress: String
  },
  type: {
    type: String,
    enum: ['login_attempt', 'failed_login', 'suspicious_activity', 'rate_limit_exceeded', 'identity_verification', 'wallet_change', 'large_transaction'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  description: { type: String, required: true },
  metadata: {
    ipAddress: String,
    userAgent: String,
    location: String,
    deviceFingerprint: String,
    additionalData: require('mongoose').Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['detected', 'investigating', 'resolved', 'false_positive'],
    default: 'detected'
  },
  actions: [{
    action: { type: String, enum: ['block_ip', 'lock_account', 'require_verification', 'notify_user', 'escalate'] },
    takenAt: { type: Date, default: Date.now },
    takenBy: String
  }]
}, { timestamps: true });

const SecurityEvent = require('mongoose').model('SecurityEvent', SecurityEventSchema);

// @route   GET /api/v1/security/status
// @desc    Get security status
// @access  Private
router.get('/status', auth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get recent security events
  const recentEvents = await SecurityEvent.find({
    'user.userId': req.user.userId
  })
  .sort({ createdAt: -1 })
  .limit(10);

  // Calculate security score
  let securityScore = 100;
  
  // Deduct points for security issues
  const criticalEvents = recentEvents.filter(e => e.severity === 'critical').length;
  const highEvents = recentEvents.filter(e => e.severity === 'high').length;
  const mediumEvents = recentEvents.filter(e => e.severity === 'medium').length;
  
  securityScore -= (criticalEvents * 20) + (highEvents * 10) + (mediumEvents * 5);
  securityScore = Math.max(0, securityScore);

  // Security features status
  const securityFeatures = {
    twoFactorAuth: user.security.twoFactorEnabled,
    identityVerified: user.profile.isVerified,
    walletVerified: true, // Always true for wallet-based auth
    ipWhitelisting: false, // Not implemented yet
    deviceTrust: true, // Simplified for demo
    antiPhishing: true,
    rateProtection: true
  };

  const securityLevel = securityScore >= 90 ? 'excellent' : 
                       securityScore >= 70 ? 'good' : 
                       securityScore >= 50 ? 'fair' : 'poor';

  res.json({
    success: true,
    message: 'Security status retrieved successfully',
    data: {
      securityScore,
      securityLevel,
      features: securityFeatures,
      recentEvents: recentEvents.map(event => ({
        type: event.type,
        severity: event.severity,
        description: event.description,
        timestamp: event.createdAt,
        status: event.status
      })),
      recommendations: generateSecurityRecommendations(user, securityScore)
    }
  });
}));

// @route   POST /api/v1/security/report-issue
// @desc    Report security issue
// @access  Private
router.post('/report-issue', [
  auth,
  body('type').isIn(['suspicious_activity', 'phishing_attempt', 'unauthorized_access', 'technical_issue', 'other']).withMessage('Invalid issue type'),
  body('description').isString().isLength({ min: 20, max: 1000 }).withMessage('Description must be between 20 and 1000 characters'),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('evidence').optional().isArray()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { type, description, severity = 'medium', evidence = [] } = req.body;

  // Generate event ID
  const crypto = require('crypto');
  const eventId = `SEC_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Create security event
  const securityEvent = new SecurityEvent({
    eventId,
    user: {
      userId: req.user.userId,
      anonymousId: req.user.anonymousId,
      walletAddress: req.user.walletAddress
    },
    type,
    severity,
    description,
    metadata: {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      additionalData: { evidence }
    },
    status: 'detected'
  });

  await securityEvent.save();

  // Auto-escalate critical issues
  if (severity === 'critical') {
    securityEvent.actions.push({
      action: 'escalate',
      takenAt: new Date(),
      takenBy: 'system'
    });
    await securityEvent.save();
  }

  logger.security('issue_reported', {
    eventId,
    userId: req.user.userId,
    type,
    severity
  });

  res.status(201).json({
    success: true,
    message: 'Security issue reported successfully',
    data: {
      eventId,
      status: 'reported',
      estimatedResponse: severity === 'critical' ? '1 hour' : '24 hours'
    }
  });
}));

// @route   GET /api/v1/security/events
// @desc    Get user's security events
// @access  Private
router.get('/events', [
  auth,
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('status').optional().isIn(['detected', 'investigating', 'resolved', 'false_positive']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { severity, status, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { 'user.userId': req.user.userId };
  if (severity) query.severity = severity;
  if (status) query.status = status;

  const [events, total] = await Promise.all([
    SecurityEvent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-metadata.additionalData'),
    SecurityEvent.countDocuments(query)
  ]);

  res.json({
    success: true,
    message: 'Security events retrieved successfully',
    data: {
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// Helper function to generate security recommendations
function generateSecurityRecommendations(user, securityScore) {
  const recommendations = [];

  if (!user.security.twoFactorEnabled) {
    recommendations.push({
      type: 'enable_2fa',
      priority: 'high',
      title: 'Enable Two-Factor Authentication',
      description: 'Add an extra layer of security to your account',
      action: 'Enable 2FA'
    });
  }

  if (!user.profile.isVerified) {
    recommendations.push({
      type: 'verify_identity',
      priority: 'medium',
      title: 'Verify Your Identity',
      description: 'Increase your account security and trading limits',
      action: 'Start Verification'
    });
  }

  if (securityScore < 70) {
    recommendations.push({
      type: 'security_review',
      priority: 'high',
      title: 'Security Review Needed',
      description: 'Your account has some security concerns that need attention',
      action: 'Review Security'
    });
  }

  return recommendations;
}

module.exports = router;