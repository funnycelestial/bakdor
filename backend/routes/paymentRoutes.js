const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const TokenTransaction = require('../models/tokenTransactionModel');
const { auth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const mobileMoneyController = require('../controllers/mobileMoneyController');
const paymentGatewayController = require('../controllers/paymentGatewayController');
const {
  asyncHandler,
  formatValidationErrors,
} = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validateRequest');
const paymentConfig = require('../config/paymentMethods');
const logger = require('../utils/logger');

const router = express.Router();

// Validation rules
const processPaymentValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('paymentMethod').isString().withMessage('Payment method is required'),
  body('type')
    .isIn(['deposit', 'withdrawal'])
    .withMessage('Invalid payment type'),
  body('phoneNumber').optional().isMobilePhone('any'),
  body('accountDetails').optional().isObject(),
];

const transactionStatusValidation = [
  param('transactionId').isMongoId().withMessage('Invalid transaction ID'),
];

const paymentHistoryValidation = [
  query('type').optional().isIn(['deposit', 'withdrawal']),
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'failed', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

// @route   GET /api/v1/payments/methods
// @desc    Get available payment methods
// @access  Private
router.get(
  '/methods',
  auth,
  asyncHandler(async (req, res) => {
    const providerStatuses =
      await mobileMoneyController.getAllProviderStatuses();

    const paymentMethods = Object.entries(providerStatuses).map(
      ([id, status]) => ({
        id,
        name: status.name || id.replace('_', ' ').toUpperCase(),
        type: 'mobile_money',
        status: status.status,
        fees: `${status.fees}%`,
        limits: status.limits,
        processingTime: status.processingTime || 'instant',
        countries: ['GH'],
      })
    );

    // Add configured payment methods
    paymentMethods.push({
      ...paymentConfig.bankCard,
      status: 'active', // You might want to make this dynamic too
    });

    res.json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: { paymentMethods },
    });
  })
);

// @route   POST /api/v1/payments/process
// @desc    Process payment
// @access  Private
router.post(
  '/process',
  [auth, paymentLimiter, ...processPaymentValidation, validateRequest],
  asyncHandler(paymentGatewayController.buyTokens)
);

// @route   GET /api/v1/payments/:id/status
// @desc    Check payment status
// @access  Private
router.get(
  '/:transactionId/status',
  [auth, ...transactionStatusValidation, validateRequest],
  asyncHandler(async (req, res) => {
    const transaction = await TokenTransaction.findOne({
      _id: req.params.transactionId,
      'user.userId': req.user.userId,
    }).select('-user.walletAddress -blockchain.blockHash');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
        data: null,
      });
    }

    res.json({
      success: true,
      message: 'Transaction status retrieved successfully',
      data: { transaction },
    });
  })
);

// @route   GET /api/v1/payments/history
// @desc    Get payment history
// @access  Private
router.get(
  '/history',
  [auth, ...paymentHistoryValidation, validateRequest],
  asyncHandler(async (req, res) => {
    const { type, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {
      'user.userId': req.user.userId,
      ...(type && { type }),
      ...(status && { status }),
    };

    const [transactions, total] = await Promise.all([
      TokenTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('transactionId type amount status createdAt updatedAt'),
      TokenTransaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      message: 'Payment history retrieved successfully',
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  })
);

module.exports = router;
