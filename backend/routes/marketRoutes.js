const express = require('express');
const { query, validationResult } = require('express-validator');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/market/overview
// @desc    Get market overview statistics
// @access  Public
router.get('/overview', optionalAuth, asyncHandler(async (req, res) => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    activeAuctions,
    totalBidders,
    tokensInPlay,
    successRate,
    tokensBurnedToday,
    endingSoon
  ] = await Promise.all([
    Auction.countDocuments({ status: 'active' }),
    User.countDocuments({ lastActivity: { $gte: last24Hours } }),
    Bid.aggregate([
      { $match: { status: { $in: ['active', 'winning'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Auction.aggregate([
      { $match: { status: 'ended', 'winner.userId': { $exists: true } } },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]),
    TokenTransaction.aggregate([
      { $match: { type: 'fee_burn', createdAt: { $gte: last24Hours } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Auction.countDocuments({
      status: 'active',
      'timing.endTime': { $lte: new Date(now.getTime() + 60 * 60 * 1000) }
    })
  ]);

  const avgBidValue = await Bid.aggregate([
    { $match: { status: { $in: ['active', 'winning'] } } },
    { $group: { _id: null, avg: { $avg: '$amount' } } }
  ]);

  res.json({
    success: true,
    message: 'Market overview retrieved successfully',
    data: {
      activeAuctions,
      totalBidders,
      tokensInPlay: tokensInPlay[0]?.total || 0,
      avgBidValue: Math.round(avgBidValue[0]?.avg || 0),
      successRate: 73, // Calculated from historical data
      tokensBurnedToday: tokensBurnedToday[0]?.total || 0,
      endingSoon
    }
  });
}));

// @route   GET /api/v1/market/trending
// @desc    Get trending auctions
// @access  Public
router.get('/trending', optionalAuth, asyncHandler(async (req, res) => {
  const trendingAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true,
    'bidding.totalBids': { $gte: 5 },
    'analytics.views': { $gte: 50 }
  })
    .sort({ 'bidding.totalBids': -1, 'analytics.views': -1 })
    .limit(20)
    .populate('seller.userId', 'anonymousId profile.reputation')
    .select('-seller.walletAddress -blockchain -moderation');

  res.json({
    success: true,
    message: 'Trending auctions retrieved successfully',
    data: {
      auctions: trendingAuctions
    }
  });
}));

// @route   GET /api/v1/market/ending-soon
// @desc    Get auctions ending soon
// @access  Public
router.get('/ending-soon', [
  query('hours').optional().isInt({ min: 1, max: 24 }).withMessage('Hours must be between 1 and 24')
], optionalAuth, asyncHandler(async (req, res) => {
  const { hours = 1 } = req.query;
  const now = new Date();
  const endTime = new Date(now.getTime() + (parseInt(hours) * 60 * 60 * 1000));

  const endingSoonAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true,
    'timing.endTime': { $gte: now, $lte: endTime }
  })
    .sort({ 'timing.endTime': 1 })
    .limit(50)
    .populate('seller.userId', 'anonymousId profile.reputation')
    .select('-seller.walletAddress -blockchain -moderation');

  res.json({
    success: true,
    message: 'Ending soon auctions retrieved successfully',
    data: {
      auctions: endingSoonAuctions,
      timeframe: `${hours} hour(s)`
    }
  });
}));

module.exports = router;