const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Notification = require('../models/notificationModel');
const { auth, adminAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// Dispute model (simplified)
const DisputeSchema = require('mongoose').Schema({
  disputeId: { type: String, required: true, unique: true },
  escrowId: { type: String, required: true },
  initiator: {
    userId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    anonymousId: String,
    role: { type: String, enum: ['buyer', 'seller'] }
  },
  respondent: {
    userId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    anonymousId: String,
    role: { type: String, enum: ['buyer', 'seller'] }
  },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  admin: {
    assignedTo: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    assignedAt: Date,
    notes: String
  },
  resolution: {
    decision: { type: String, enum: ['buyer_favor', 'seller_favor', 'partial_refund', 'no_action'] },
    reasoning: String,
    resolvedAt: Date,
    resolvedBy: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' }
  },
  communication: [{
    from: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    message: String,
    timestamp: { type: Date, default: Date.now },
    isAdminMessage: { type: Boolean, default: false }
  }],
  evidence: [{
    type: { type: String, enum: ['image', 'document', 'link', 'text'] },
    content: String,
    uploadedBy: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const Dispute = require('mongoose').model('Dispute', DisputeSchema);

// @route   GET /api/v1/disputes
// @desc    Get user disputes
// @access  Private
router.get('/', [
  auth,
  query('status').optional().isIn(['open', 'investigating', 'resolved', 'closed']),
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

  const { status, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    $or: [
      { 'initiator.userId': req.user.userId },
      { 'respondent.userId': req.user.userId }
    ]
  };

  if (status) query.status = status;

  const [disputes, total] = await Promise.all([
    Dispute.find(query)
      .populate('admin.assignedTo', 'anonymousId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Dispute.countDocuments(query)
  ]);

  res.json({
    success: true,
    message: 'Disputes retrieved successfully',
    data: {
      disputes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// @route   GET /api/v1/disputes/:id
// @desc    Get specific dispute details
// @access  Private
router.get('/:disputeId', [
  auth,
  param('disputeId').isString().withMessage('Invalid dispute ID')
], asyncHandler(async (req, res) => {
  const dispute = await Dispute.findOne({ disputeId: req.params.disputeId })
    .populate('initiator.userId', 'anonymousId')
    .populate('respondent.userId', 'anonymousId')
    .populate('admin.assignedTo', 'anonymousId')
    .populate('communication.from', 'anonymousId');

  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }

  // Check if user is involved
  const isInvolved = dispute.initiator.userId.toString() === req.user.userId || 
                   dispute.respondent.userId.toString() === req.user.userId;

  if (!isInvolved) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - not involved in this dispute',
      data: null
    });
  }

  res.json({
    success: true,
    message: 'Dispute details retrieved successfully',
    data: {
      dispute
    }
  });
}));

// @route   POST /api/v1/disputes/:id/respond
// @desc    Add response to dispute
// @access  Private
router.post('/:disputeId/respond', [
  auth,
  param('disputeId').isString().withMessage('Invalid dispute ID'),
  body('message').isString().isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
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

  const { message, evidence = [] } = req.body;
  
  const dispute = await Dispute.findOne({ disputeId: req.params.disputeId });
  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }

  // Check if user is involved
  const isInvolved = dispute.initiator.userId.toString() === req.user.userId || 
                   dispute.respondent.userId.toString() === req.user.userId;

  if (!isInvolved) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - not involved in this dispute',
      data: null
    });
  }

  // Add communication
  dispute.communication.push({
    from: req.user.userId,
    message,
    timestamp: new Date(),
    isAdminMessage: false
  });

  // Add evidence if provided
  evidence.forEach(item => {
    dispute.evidence.push({
      type: item.type,
      content: item.content,
      uploadedBy: req.user.userId,
      uploadedAt: new Date()
    });
  });

  await dispute.save();

  // Notify other party
  const otherPartyId = dispute.initiator.userId.toString() === req.user.userId ? 
                      dispute.respondent.userId : dispute.initiator.userId;
  const otherPartyAnonymousId = dispute.initiator.userId.toString() === req.user.userId ? 
                               dispute.respondent.anonymousId : dispute.initiator.anonymousId;

  const notification = new Notification({
    recipient: {
      userId: otherPartyId,
      anonymousId: otherPartyAnonymousId
    },
    type: 'dispute_filed',
    priority: 'medium',
    title: 'Dispute Response',
    message: `New response added to dispute ${dispute.disputeId}`,
    data: {
      disputeId: dispute.disputeId,
      escrowId: dispute.escrowId
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });

  await notification.save();

  logger.dispute('response_added', dispute.disputeId, {
    responderId: req.user.userId,
    messageLength: message.length,
    evidenceCount: evidence.length
  });

  res.json({
    success: true,
    message: 'Response added to dispute',
    data: {
      dispute: {
        disputeId: dispute.disputeId,
        status: dispute.status,
        lastResponse: new Date()
      }
    }
  });
}));

// @route   POST /api/v1/disputes/:id/resolve
// @desc    Resolve dispute (admin only)
// @access  Admin
router.post('/:disputeId/resolve', [
  adminAuth,
  param('disputeId').isString().withMessage('Invalid dispute ID'),
  body('decision').isIn(['buyer_favor', 'seller_favor', 'partial_refund', 'no_action']).withMessage('Invalid decision'),
  body('reasoning').isString().isLength({ min: 20, max: 1000 }).withMessage('Reasoning must be between 20 and 1000 characters'),
  body('refundPercentage').optional().isFloat({ min: 0, max: 100 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { decision, reasoning, refundPercentage = 0 } = req.body;
  
  const dispute = await Dispute.findOne({ disputeId: req.params.disputeId });
  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }

  // Update dispute
  dispute.status = 'resolved';
  dispute.resolution = {
    decision,
    reasoning,
    resolvedAt: new Date(),
    resolvedBy: req.user.userId
  };
  dispute.admin.assignedTo = req.user.userId;
  dispute.admin.assignedAt = new Date();

  await dispute.save();

  // Create notifications for both parties
  const notifications = [
    new Notification({
      recipient: {
        userId: dispute.initiator.userId,
        anonymousId: dispute.initiator.anonymousId
      },
      type: 'dispute_resolved',
      priority: 'high',
      title: 'Dispute Resolved',
      message: `Dispute ${dispute.disputeId} has been resolved by admin.`,
      data: {
        disputeId: dispute.disputeId,
        decision,
        reasoning
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    }),
    new Notification({
      recipient: {
        userId: dispute.respondent.userId,
        anonymousId: dispute.respondent.anonymousId
      },
      type: 'dispute_resolved',
      priority: 'high',
      title: 'Dispute Resolved',
      message: `Dispute ${dispute.disputeId} has been resolved by admin.`,
      data: {
        disputeId: dispute.disputeId,
        decision,
        reasoning
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    })
  ];

  await Promise.all(notifications.map(n => n.save()));

  logger.dispute('resolved', dispute.disputeId, {
    resolvedBy: req.user.userId,
    decision,
    refundPercentage
  });

  res.json({
    success: true,
    message: 'Dispute resolved successfully',
    data: {
      dispute: {
        disputeId: dispute.disputeId,
        status: dispute.status,
        decision,
        resolvedAt: dispute.resolution.resolvedAt
      }
    }
  });
}));

module.exports = router;