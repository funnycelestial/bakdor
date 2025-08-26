const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');
const { auth, optionalAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/tokens/info
// @desc    Get WKC token information
// @access  Public
router.get('/info', optionalAuth, asyncHandler(async (req, res) => {
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
}));

// @route   GET /api/v1/tokens/balance/:address
// @desc    Get token balance for wallet address
// @access  Public
router.get('/balance/:address', [
  param('address').isLength({ min: 42, max: 42 }).withMessage('Invalid wallet address')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

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
}));

// @route   GET /api/v1/tokens/burn-stats
// @desc    Get token burn statistics
// @access  Public
router.get('/burn-stats', [
  query('period').optional().isIn(['24h', '7d', '30d', '90d', 'all']).withMessage('Invalid period')
], asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;
  
  let startDate = new Date();
  if (period !== 'all') {
    switch (period) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }
  }

  const query = { type: 'fee_burn' };
  if (period !== 'all') {
    query.createdAt = { $gte: startDate };
  }

  const burnStats = await TokenTransaction.aggregate([
    { $match: query },
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
}));

// @route   POST /api/v1/tokens/burn
// @desc    Burn tokens (admin only for manual burns)
// @access  Admin
router.post('/burn', [
  require('../middleware/auth').adminAuth,
  body('amount').isFloat({ min: 0.01 }).withMessage('Burn amount must be greater than 0'),
  body('reason').isString().isLength({ min: 5, max: 200 }).withMessage('Reason must be between 5 and 200 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { amount, reason } = req.body;

  try {
    const burnResult = await web3Service.burnTokens(amount, reason);

    // Create burn transaction record
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
        gasUsed: burnResult.gasUsed,
        isConfirmed: true
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

  } catch (error) {
    logger.error('Manual token burn failed:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to burn tokens',
      data: null
    });
  }
}));

// @route   GET /api/v1/tokens/treasury
// @desc    Get treasury information
// @access  Public
router.get('/treasury', asyncHandler(async (req, res) => {
  try {
    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
    const treasuryBalance = await web3Service.getTokenBalance(treasuryAddress);
    
    // Get treasury transaction history
    const treasuryTransactions = await TokenTransaction.find({
      type: 'fee_payment',
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

  } catch (error) {
    logger.error('Error getting treasury info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve treasury information',
      data: null
    });
  }
}));

module.exports = router;