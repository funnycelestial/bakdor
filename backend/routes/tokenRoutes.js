// routes/tokenRoutes.js
const express = require('express');
const { body, query, param } = require('express-validator');
const { auth, adminAuth } = require('../middleware/auth');
const { asyncHandler, validate } = require('../middleware/errorHandler');
const tokenTransactionController = require('../controllers/tokenTransactionController');
const TokenTransaction = require('../models/tokenTransactionModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

const router = express.Router();

// Validators
const transactionHistoryValidators = [
  query('type').optional().isIn([
    'deposit', 'withdrawal', 'bid_lock', 'bid_unlock', 'escrow_lock', 
    'escrow_release', 'fee_payment', 'fee_burn', 'transfer', 'refund', 'reward', 'sync'
  ]).withMessage('Invalid transaction type'),
  query('status').optional().isIn(['pending', 'confirmed', 'failed', 'cancelled', 'success']).withMessage('Invalid status'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const adjustBalanceValidators = [
  body('userId').isMongoId().withMessage('Invalid user ID'),
  body('amount').isFloat().withMessage('Amount must be a number'),
  body('reason').isString().isLength({ min: 5, max: 200 }).withMessage('Reason must be between 5 and 200 characters')
];

const burnTokensValidators = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Burn amount must be greater than 0'),
  body('reason').isString().isLength({ min: 5, max: 200 }).withMessage('Reason must be between 5 and 200 characters')
];

// ROUTES

// @desc    Get user transaction history
// @route   GET /api/v1/token-transactions/history
// @access  Private
router.get(
  '/history',
  auth,
  transactionHistoryValidators,
  validate,
  asyncHandler(async (req, res) => {
    await tokenTransactionController.getTransactionHistory(req, res);
  })
);

// @desc    Get user's token balance
// @route   GET /api/v1/token-transactions/balance
// @access  Private
router.get(
  '/balance',
  auth,
  asyncHandler(async (req, res) => {
    await tokenTransactionController.getUserBalance(req, res);
  })
);

// @desc    Admin balance adjustment
// @route   POST /api/v1/token-transactions/adjust-balance
// @access  Private (Admin)
router.post(
  '/adjust-balance',
  adminAuth,
  adjustBalanceValidators,
  validate,
  asyncHandler(async (req, res) => {
    await tokenTransactionController.adjustBalance(req, res);
  })
);

// @desc    Get token information and platform stats
// @route   GET /api/v1/token-transactions/info
// @access  Public
router.get(
  '/info',
  asyncHandler(async (req, res) => {
    const tokenInfo = await web3Service.getTokenInfo();
    const platformStats = await web3Service.getPlatformStats();
    res.json({
      success: true,
      message: 'Token information retrieved successfully',
      data: {
        token: tokenInfo,
        platform: platformStats,
        burnMechanism: {
          description: "50% of platform fees are burned to reduce token supply",
          burnPercentage: 50,
          totalBurned: tokenInfo.totalBurned,
          burnRate: tokenInfo.burnRate
        }
      }
    });
  })
);

// @desc    Get token balance for a wallet address
// @route   GET /api/v1/token-transactions/balance/:address
// @access  Public
router.get(
  '/balance/:address',
  param('address').isLength({ min: 42, max: 42 }).withMessage('Invalid wallet address'),
  validate,
  asyncHandler(async (req, res) => {
    const balance = await web3Service.getTokenBalance(req.params.address);
    res.json({
      success: true,
      message: 'Balance retrieved successfully',
      data: {
        walletAddress: req.params.address,
        balance: parseFloat(balance),
        currency: 'WKC'
      }
    });
  })
);

// @desc    Get burn statistics
// @route   GET /api/v1/token-transactions/burn-stats
// @access  Public
router.get(
  '/burn-stats',
  query('period').optional().isIn(['24h', '7d', '30d', '90d', 'all']).withMessage('Invalid period'),
  validate,
  asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    let startDate = new Date();
    
    if (period !== 'all') {
      switch (period) {
        case '24h': startDate.setHours(startDate.getHours() - 24); break;
        case '7d': startDate.setDate(startDate.getDate() - 7); break;
        case '30d': startDate.setDate(startDate.getDate() - 30); break;
        case '90d': startDate.setDate(startDate.getDate() - 90); break;
      }
    }
    
    const matchQuery = { type: 'fee_burn', status: 'confirmed' };
    if (period !== 'all') {
      matchQuery.createdAt = { $gte: startDate };
    }
    
    const burnStats = await TokenTransaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalBurned: { $sum: '$amount' },
          burnCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const totalBurned = burnStats.reduce((sum, day) => sum + day.totalBurned, 0);
    const tokenInfo = await web3Service.getTokenInfo();
    
    res.json({
      success: true,
      message: 'Burn statistics retrieved successfully',
      data: {
        period,
        totalBurned,
        burnCount: burnStats.reduce((sum, day) => sum + day.burnCount, 0),
        dailyBurns: burnStats,
        tokenomics: {
          totalSupply: tokenInfo.totalSupply,
          circulatingSupply: tokenInfo.circulatingSupply,
          burnRate: tokenInfo.burnRate,
          deflationaryPressure: (totalBurned / parseFloat(tokenInfo.totalSupply) * 100).toFixed(4)
        }
      }
    });
  })
);

// @desc    Burn tokens (Admin only)
// @route   POST /api/v1/token-transactions/burn
// @access  Private (Admin)
router.post(
  '/burn',
  adminAuth,
  burnTokensValidators,
  validate,
  asyncHandler(async (req, res) => {
    const { amount, reason } = req.body;
    
    const burnResult = await web3Service.burnTokens(amount, reason);
    
    const burnTransaction = new TokenTransaction({
      type: 'fee_burn',
      user: {
        userId: req.user.userId,
        walletAddress: req.user.walletAddress,
        anonymousId: req.user.anonymousId
      },
      amount,
      blockchain: {
        transactionHash: burnResult.transactionHash,
        blockNumber: burnResult.blockNumber,
        blockHash: burnResult.blockHash,
        gasUsed: burnResult.gasUsed,
        gasPrice: burnResult.gasPrice,
        confirmations: burnResult.confirmations,
        isConfirmed: true
      },
      fees: {
        platformFee: amount,
        burnAmount: amount,
        gasFee: burnResult.gasUsed * parseFloat(burnResult.gasPrice)
      },
      status: 'confirmed',
      metadata: {
        description: reason,
        source: 'admin',
        initiatedBy: 'admin'
      }
    });
    
    await burnTransaction.save();
    
    logger.blockchain('manual_burn', {
      amount,
      reason,
      burnedBy: req.user.userId,
      transactionHash: burnResult.transactionHash
    });
    
    res.json({
      success: true,
      message: 'Tokens burned successfully',
      data: {
        burnedAmount: amount,
        reason,
        transactionHash: burnResult.transactionHash,
        blockNumber: burnResult.blockNumber
      }
    });
  })
);

// @desc    Get treasury information
// @route   GET /api/v1/token-transactions/treasury
// @access  Public
router.get(
  '/treasury',
  asyncHandler(async (req, res) => {
    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
    const treasuryBalance = await web3Service.getTokenBalance(treasuryAddress);
    
    const treasuryTransactions = await TokenTransaction.find({
      type: 'fee_payment',
      status: 'confirmed',
      'fees.treasuryAmount': { $gt: 0 }
    })
      .sort({ createdAt: -1 })
      .limit(100);
    
    const totalTreasuryIncome = treasuryTransactions.reduce(
      (sum, tx) => sum + (tx.fees.treasuryAmount || 0), 0
    );
    
    res.json({
      success: true,
      message: 'Treasury information retrieved successfully',
      data: {
        treasury: {
          address: treasuryAddress,
          currentBalance: parseFloat(treasuryBalance),
          totalIncome: totalTreasuryIncome,
          transactionCount: treasuryTransactions.length
        },
        recentTransactions: treasuryTransactions.slice(0, 10),
        transparency: {
          description: "50% of platform fees go to treasury for platform development and sustainability",
          allocation: "Treasury funds are used for development, marketing, and platform improvements"
        }
      }
    });
  })
);

module.exports = router;