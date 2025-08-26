const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Auction = require('../models/auctionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const Notification = require('../models/notificationModel');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

const router = express.Router();

// Escrow model (simplified for this implementation)
const EscrowSchema = require('mongoose').Schema({
  escrowId: { type: String, required: true, unique: true },
  auction: {
    auctionId: String,
    auctionRef: { type: require('mongoose').Schema.Types.ObjectId, ref: 'Auction' }
  },
  buyer: {
    userId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    anonymousId: String,
    walletAddress: String
  },
  seller: {
    userId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User' },
    anonymousId: String,
    walletAddress: String
  },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['created', 'funded', 'delivered', 'confirmed', 'released', 'disputed', 'resolved'],
    default: 'created'
  },
  blockchain: {
    contractAddress: String,
    transactionHash: String,
    blockNumber: Number,
    isOnChain: { type: Boolean, default: false }
  },
  delivery: {
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    deliveredAt: Date,
    confirmedBy: String
  },
  dispute: {
    isDisputed: { type: Boolean, default: false },
    disputeId: String,
    reason: String,
    filedAt: Date
  }
}, { timestamps: true });

const Escrow = require('mongoose').model('Escrow', EscrowSchema);

// @route   GET /api/v1/escrow/transactions
// @desc    Get user's escrow transactions
// @access  Private
router.get('/transactions', [
  auth,
  query('status').optional().isIn(['created', 'funded', 'delivered', 'confirmed', 'released', 'disputed', 'resolved']),
  query('role').optional().isIn(['buyer', 'seller']),
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

  const { status, role, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query based on user role
  let query = {};
  if (role === 'buyer') {
    query['buyer.userId'] = req.user.userId;
  } else if (role === 'seller') {
    query['seller.userId'] = req.user.userId;
  } else {
    query.$or = [
      { 'buyer.userId': req.user.userId },
      { 'seller.userId': req.user.userId }
    ];
  }

  if (status) query.status = status;

  const [escrows, total] = await Promise.all([
    Escrow.find(query)
      .populate('auction.auctionRef', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Escrow.countDocuments(query)
  ]);

  res.json({
    success: true,
    message: 'Escrow transactions retrieved successfully',
    data: {
      escrows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// @route   GET /api/v1/escrow/:id
// @desc    Get specific escrow details
// @access  Private
router.get('/:escrowId', [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID')
], asyncHandler(async (req, res) => {
  const escrow = await Escrow.findOne({ escrowId: req.params.escrowId })
    .populate('auction.auctionRef', 'title description')
    .populate('buyer.userId', 'anonymousId profile.reputation')
    .populate('seller.userId', 'anonymousId profile.reputation');

  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  // Check if user is involved in this escrow
  const isInvolved = escrow.buyer.userId.toString() === req.user.userId || 
                   escrow.seller.userId.toString() === req.user.userId;

  if (!isInvolved) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - not involved in this escrow',
      data: null
    });
  }

  res.json({
    success: true,
    message: 'Escrow details retrieved successfully',
    data: {
      escrow
    }
  });
}));

// @route   POST /api/v1/escrow/:id/confirm-delivery
// @desc    Confirm delivery (buyer)
// @access  Private
router.post('/:escrowId/confirm-delivery', [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('feedback').optional().isString().isLength({ max: 500 }).withMessage('Feedback too long')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { rating, feedback } = req.body;
  
  const escrow = await Escrow.findOne({ escrowId: req.params.escrowId });
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  // Check if user is the buyer
  if (escrow.buyer.userId.toString() !== req.user.userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the buyer can confirm delivery',
      data: null
    });
  }

  // Check escrow status
  if (escrow.status !== 'delivered') {
    return res.status(400).json({
      success: false,
      message: 'Escrow must be in delivered status to confirm',
      data: null
    });
  }

  try {
    // Release escrow on blockchain
    const releaseResult = await web3Service.releaseEscrowOnChain(escrow.escrowId);

    // Update escrow status
    escrow.status = 'released';
    escrow.delivery.confirmedBy = req.user.anonymousId;
    escrow.delivery.deliveredAt = new Date();
    escrow.blockchain.transactionHash = releaseResult.transactionHash;
    escrow.blockchain.blockNumber = releaseResult.blockNumber;
    await escrow.save();

    // Create token transaction for escrow release
    const releaseTransaction = new TokenTransaction({
      type: 'escrow_release',
      user: {
        userId: escrow.seller.userId,
        walletAddress: escrow.seller.walletAddress,
        anonymousId: escrow.seller.anonymousId
      },
      amount: escrow.amount,
      blockchain: {
        transactionHash: releaseResult.transactionHash,
        blockNumber: releaseResult.blockNumber,
        gasUsed: releaseResult.gasUsed,
        isConfirmed: true
      },
      relatedTo: {
        type: 'escrow',
        id: escrow.escrowId,
        reference: escrow._id
      },
      status: 'confirmed'
    });

    await releaseTransaction.save();

    // Update seller reputation if rating provided
    if (rating) {
      const seller = await User.findById(escrow.seller.userId);
      await seller.updateReputation(rating);
    }

    // Create notifications
    const notifications = [
      new Notification({
        recipient: {
          userId: escrow.seller.userId,
          anonymousId: escrow.seller.anonymousId
        },
        type: 'escrow_released',
        priority: 'high',
        title: 'Payment Released',
        message: `Buyer confirmed delivery. ${escrow.amount} WKC has been released to your wallet.`,
        data: {
          escrowId: escrow.escrowId,
          amount: escrow.amount,
          currency: 'WKC'
        },
        channels: {
          inApp: { enabled: true },
          email: { enabled: true }
        }
      }),
      new Notification({
        recipient: {
          userId: escrow.buyer.userId,
          anonymousId: escrow.buyer.anonymousId
        },
        type: 'delivery_confirmed',
        priority: 'medium',
        title: 'Delivery Confirmed',
        message: 'You have successfully confirmed delivery. Transaction completed.',
        data: {
          escrowId: escrow.escrowId,
          amount: escrow.amount
        },
        channels: {
          inApp: { enabled: true }
        }
      })
    ];

    await Promise.all(notifications.map(n => n.save()));

    logger.escrow('delivery_confirmed', escrow.escrowId, {
      buyerId: req.user.userId,
      sellerId: escrow.seller.userId,
      amount: escrow.amount,
      rating
    });

    res.json({
      success: true,
      message: 'Delivery confirmed and payment released',
      data: {
        escrow: {
          escrowId: escrow.escrowId,
          status: escrow.status,
          amount: escrow.amount,
          releasedAt: escrow.delivery.deliveredAt,
          transactionHash: releaseResult.transactionHash
        }
      }
    });

  } catch (blockchainError) {
    logger.error('Escrow release failed:', blockchainError);
    
    res.status(400).json({
      success: false,
      message: 'Failed to release escrow on blockchain',
      data: null
    });
  }
}));

// @route   POST /api/v1/escrow/:id/mark-delivered
// @desc    Mark as delivered (seller)
// @access  Private
router.post('/:escrowId/mark-delivered', [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('trackingNumber').optional().isString(),
  body('carrier').optional().isString(),
  body('deliveryNotes').optional().isString().isLength({ max: 500 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { trackingNumber, carrier, deliveryNotes } = req.body;
  
  const escrow = await Escrow.findOne({ escrowId: req.params.escrowId });
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  // Check if user is the seller
  if (escrow.seller.userId.toString() !== req.user.userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the seller can mark as delivered',
      data: null
    });
  }

  // Check escrow status
  if (escrow.status !== 'funded') {
    return res.status(400).json({
      success: false,
      message: 'Escrow must be funded to mark as delivered',
      data: null
    });
  }

  // Update escrow
  escrow.status = 'delivered';
  escrow.delivery.trackingNumber = trackingNumber;
  escrow.delivery.carrier = carrier;
  escrow.delivery.deliveredAt = new Date();
  await escrow.save();

  // Create notification for buyer
  const notification = new Notification({
    recipient: {
      userId: escrow.buyer.userId,
      anonymousId: escrow.buyer.anonymousId
    },
    type: 'delivery_confirmed',
    priority: 'high',
    title: 'Item Delivered',
    message: `Seller marked your item as delivered. Please confirm receipt to release payment.`,
    data: {
      escrowId: escrow.escrowId,
      trackingNumber,
      carrier,
      deliveryNotes
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });

  await notification.save();

  logger.escrow('marked_delivered', escrow.escrowId, {
    sellerId: req.user.userId,
    buyerId: escrow.buyer.userId,
    trackingNumber
  });

  res.json({
    success: true,
    message: 'Item marked as delivered',
    data: {
      escrow: {
        escrowId: escrow.escrowId,
        status: escrow.status,
        delivery: escrow.delivery
      }
    }
  });
}));

// @route   POST /api/v1/escrow/:id/dispute
// @desc    Initiate dispute
// @access  Private
router.post('/:escrowId/dispute', [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('reason').isString().isLength({ min: 10, max: 1000 }).withMessage('Reason must be between 10 and 1000 characters'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array'),
  body('requestedResolution').optional().isString().isLength({ max: 500 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { reason, evidence = [], requestedResolution } = req.body;
  
  const escrow = await Escrow.findOne({ escrowId: req.params.escrowId });
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  // Check if user is involved in this escrow
  const isInvolved = escrow.buyer.userId.toString() === req.user.userId || 
                   escrow.seller.userId.toString() === req.user.userId;

  if (!isInvolved) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - not involved in this escrow',
      data: null
    });
  }

  // Check if already disputed
  if (escrow.dispute.isDisputed) {
    return res.status(400).json({
      success: false,
      message: 'Escrow is already under dispute',
      data: null
    });
  }

  // Generate dispute ID
  const crypto = require('crypto');
  const disputeId = `DIS_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Update escrow
  escrow.status = 'disputed';
  escrow.dispute.isDisputed = true;
  escrow.dispute.disputeId = disputeId;
  escrow.dispute.reason = reason;
  escrow.dispute.filedAt = new Date();
  await escrow.save();

  // Create notifications for both parties and admin
  const notifications = [
    new Notification({
      recipient: {
        userId: escrow.buyer.userId === req.user.userId ? escrow.seller.userId : escrow.buyer.userId,
        anonymousId: escrow.buyer.userId === req.user.userId ? escrow.seller.anonymousId : escrow.buyer.anonymousId
      },
      type: 'dispute_filed',
      priority: 'high',
      title: 'Dispute Filed',
      message: `A dispute has been filed for escrow ${escrow.escrowId}. Admin review initiated.`,
      data: {
        escrowId: escrow.escrowId,
        disputeId,
        reason
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    })
  ];

  await Promise.all(notifications.map(n => n.save()));

  logger.dispute('filed', disputeId, {
    escrowId: escrow.escrowId,
    filedBy: req.user.userId,
    reason
  });

  res.status(201).json({
    success: true,
    message: 'Dispute filed successfully',
    data: {
      dispute: {
        disputeId,
        escrowId: escrow.escrowId,
        status: 'open',
        reason,
        filedAt: escrow.dispute.filedAt
      }
    }
  });
}));

module.exports = router;