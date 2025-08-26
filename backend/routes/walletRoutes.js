const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, ValidationError } = require('../middleware/errorHandler');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/wallet/balance
// @desc    Get user token balance
// @access  Private
router.get('/balance', auth, asyncHandler(async (req, res) => {
  try {
    // Simulate blockchain balance for demo
    const blockchainBalance = (Math.random() * 5000 + 1000).toFixed(2);
    
    // Get balance summary from transactions
    const balanceSummary = {
      available: parseFloat(blockchainBalance) * 0.8,
      locked: parseFloat(blockchainBalance) * 0.2,
      total: parseFloat(blockchainBalance)
    };
    
    // Get pending transactions
    const pendingTransactions = await TokenTransaction.find({
      'user.userId': req.user.userId,
      status: 'pending'
    }).select('type amount createdAt');

    logger.user('balance_checked', req.user.userId, {
      blockchainBalance,
      calculatedBalance: balanceSummary
    });

    res.json({
      success: true,
      message: 'Balance retrieved successfully',
      data: {
        balance: {
          available: balanceSummary.available,
          locked: balanceSummary.locked,
          total: balanceSummary.total,
          blockchain: parseFloat(blockchainBalance)
        },
        pendingTransactions
      }
    });

  } catch (error) {
    logger.error('Error getting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve balance',
      data: null
    });
  }
}));

// @route   GET /api/v1/wallet/transactions
// @desc    Get transaction history
// @access  Private
router.get('/transactions', [
  auth,
  query('type').optional().isIn(['deposit', 'withdrawal', 'bid_lock', 'bid_unlock', 'escrow_lock', 'escrow_release', 'fee_payment', 'transfer', 'refund']),
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

  const { type, page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { 'user.userId': req.user.userId };
  if (type) query.type = type;

  const [transactions, total] = await Promise.all([
    TokenTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-user.walletAddress -blockchain.blockHash'),
    TokenTransaction.countDocuments(query)
  ]);

  res.json({
    success: true,
    message: 'Transaction history retrieved successfully',
    data: {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// @route   POST /api/v1/wallet/deposit
// @desc    Deposit tokens
// @access  Private
router.post('/deposit', [
  auth,
  body('amount').isFloat({ min: 1 }).withMessage('Deposit amount must be at least 1 token'),
  body('paymentMethod').isIn(['mtn_momo', 'vodafone_cash', 'airteltigo', 'telecel_cash', 'bank_card']).withMessage('Invalid payment method'),
  body('phoneNumber').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  body('reference').optional().isString().withMessage('Invalid reference')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { amount, paymentMethod, phoneNumber, reference } = req.body;

  // Create pending transaction
  const transaction = new TokenTransaction({
    type: 'deposit',
    user: {
      userId: req.user.userId,
      walletAddress: req.user.walletAddress,
      anonymousId: req.user.anonymousId
    },
    amount,
    status: 'pending',
    mobileMoneyIntegration: {
      provider: paymentMethod,
      phoneNumber,
      externalTransactionId: reference,
      exchangeRate: 1.0, // 1 GHS = 1 WKC
      localAmount: amount,
      localCurrency: 'GHS'
    },
    metadata: {
      source: 'web',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      initiatedBy: 'user'
    }
  });

  await transaction.save();

  // Here you would integrate with actual mobile money APIs
  // For now, we'll simulate the process
  
  logger.payment('deposit_initiated', amount, 'WKC', {
    userId: req.user.userId,
    paymentMethod,
    transactionId: transaction.transactionId
  });

  res.status(201).json({
    success: true,
    message: 'Deposit initiated successfully',
    data: {
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        paymentMethod,
        createdAt: transaction.createdAt
      }
    }
  });
}));

// @route   POST /api/v1/wallet/withdraw
// @desc    Withdraw tokens
// @access  Private
router.post('/withdraw', [
  auth,
  body('amount').isFloat({ min: 1 }).withMessage('Withdrawal amount must be at least 1 token'),
  body('paymentMethod').isIn(['mtn_momo', 'vodafone_cash', 'airteltigo', 'telecel_cash', 'bank_card']).withMessage('Invalid payment method'),
  body('phoneNumber').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  body('accountDetails').optional().isObject().withMessage('Invalid account details')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { amount, paymentMethod, phoneNumber, accountDetails } = req.body;

  // Check available balance
  const balanceSummary = await TokenTransaction.getUserBalanceSummary(req.user.userId);
  
  if (balanceSummary.available < amount) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient available balance',
      data: {
        available: balanceSummary.available,
        requested: amount
      }
    });
  }

  try {
    // Transfer tokens from user wallet to platform wallet
    const transferResult = await web3Service.transferTokens(
      process.env.PLATFORM_WALLET_ADDRESS,
      amount
    );

    // Create withdrawal transaction
    const transaction = new TokenTransaction({
      type: 'withdrawal',
      user: {
        userId: req.user.userId,
        walletAddress: req.user.walletAddress,
        anonymousId: req.user.anonymousId
      },
      amount,
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      mobileMoneyIntegration: {
        provider: paymentMethod,
        phoneNumber,
        exchangeRate: 1.0,
        localAmount: amount,
        localCurrency: 'GHS'
      },
      metadata: {
        source: 'web',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        initiatedBy: 'user'
      }
    });

    await transaction.save();

    logger.payment('withdrawal_completed', amount, 'WKC', {
      userId: req.user.userId,
      paymentMethod,
      transactionHash: transferResult.transactionHash
    });

    res.json({
      success: true,
      message: 'Withdrawal completed successfully',
      data: {
        transaction: {
          id: transaction._id,
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          status: transaction.status,
          transactionHash: transferResult.transactionHash,
          createdAt: transaction.createdAt
        }
      }
    });

  } catch (blockchainError) {
    logger.error('Blockchain withdrawal failed:', blockchainError);
    
    res.status(400).json({
      success: false,
      message: 'Failed to process withdrawal on blockchain',
      data: null
    });
  }
}));

// @route   POST /api/v1/wallet/transfer
// @desc    Transfer tokens to another user
// @access  Private
router.post('/transfer', [
  auth,
  body('recipientAddress').isLength({ min: 42, max: 42 }).withMessage('Invalid recipient wallet address'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Transfer amount must be greater than 0'),
  body('note').optional().isString().isLength({ max: 200 }).withMessage('Note too long')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { recipientAddress, amount, note } = req.body;

  // Check if recipient exists
  const recipient = await User.findByWallet(recipientAddress);
  if (!recipient) {
    return res.status(404).json({
      success: false,
      message: 'Recipient wallet not found',
      data: null
    });
  }

  // Check available balance
  const balanceSummary = await TokenTransaction.getUserBalanceSummary(req.user.userId);
  
  if (balanceSummary.available < amount) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient available balance',
      data: null
    });
  }

  try {
    // Transfer tokens on blockchain
    const transferResult = await web3Service.transferTokens(recipientAddress, amount);

    // Create transaction records for both sender and recipient
    const senderTransaction = new TokenTransaction({
      type: 'transfer',
      user: {
        userId: req.user.userId,
        walletAddress: req.user.walletAddress,
        anonymousId: req.user.anonymousId
      },
      amount: -amount, // Negative for sender
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        description: note || 'Token transfer',
        source: 'web',
        initiatedBy: 'user'
      }
    });

    const recipientTransaction = new TokenTransaction({
      type: 'transfer',
      user: {
        userId: recipient._id,
        walletAddress: recipient.walletAddress,
        anonymousId: recipient.anonymousId
      },
      amount: amount, // Positive for recipient
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        description: note || 'Token transfer received',
        source: 'web',
        initiatedBy: 'user'
      }
    });

    await Promise.all([
      senderTransaction.save(),
      recipientTransaction.save()
    ]);

    logger.payment('transfer_completed', amount, 'WKC', {
      senderId: req.user.userId,
      recipientId: recipient._id,
      transactionHash: transferResult.transactionHash
    });

    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: {
        transaction: {
          transactionHash: transferResult.transactionHash,
          amount,
          recipient: recipient.anonymousId,
          note
        }
      }
    });

  } catch (blockchainError) {
    logger.error('Blockchain transfer failed:', blockchainError);
    
    res.status(400).json({
      success: false,
      message: 'Failed to transfer tokens on blockchain',
      data: null
    });
  }
}));

module.exports = router;