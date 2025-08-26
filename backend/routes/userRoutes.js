const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const User = require('../models/userModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { auth, optionalAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/users/profile
// @desc    Get user profile with stats
// @access  Private
router.get('/profile', auth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).select('-security.twoFactorSecret');
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get user statistics
  const [totalAuctions, totalBids, wonAuctions, balanceSummary] = await Promise.all([
    Auction.countDocuments({ 'seller.userId': req.user.userId }),
    Bid.countDocuments({ 'bidder.userId': req.user.userId }),
    Bid.countDocuments({ 'bidder.userId': req.user.userId, status: 'won' }),
    TokenTransaction.getUserBalanceSummary ? 
      TokenTransaction.getUserBalanceSummary(req.user.userId) : 
      { total: 0, available: 0, locked: 0 }
  ]);

  // Calculate success rate
  const successRate = totalBids > 0 ? Math.round((wonAuctions / totalBids) * 100) : 0;

  // Update user profile stats
  user.profile.totalAuctions = totalAuctions;
  user.profile.wonAuctions = wonAuctions;
  user.profile.successRate = successRate;
  await user.save();

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
        stats: {
          totalAuctions,
          totalBids,
          wonAuctions,
          successRate,
          balance: balanceSummary
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
}));

// @route   GET /api/v1/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', auth, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  // Get user's active auctions
  const activeAuctions = await Auction.find({
    'seller.userId': userId,
    status: 'active'
  }).limit(10);

  // Get user's active bids
  const activeBids = await Bid.find({
    'bidder.userId': userId,
    status: { $in: ['active', 'winning'] }
  }).populate('auction.auctionRef', 'title timing.endTime').limit(10);

  // Get recent activity
  const recentActivity = await Promise.all([
    Auction.find({ 'seller.userId': userId }).sort({ createdAt: -1 }).limit(5),
    Bid.find({ 'bidder.userId': userId }).sort({ 'timing.placedAt': -1 }).limit(5)
  ]);

  res.json({
    success: true,
    message: 'Dashboard data retrieved successfully',
    data: {
      activeAuctions,
      activeBids,
      recentAuctions: recentActivity[0],
      recentBids: recentActivity[1]
    }
  });
}));

// @route   GET /api/v1/users/watchlist
// @desc    Get user's watched auctions
// @access  Private
router.get('/watchlist', auth, asyncHandler(async (req, res) => {
  const auctions = await Auction.find({
    'watchers.userId': req.user.userId,
    status: { $in: ['active', 'pending'] }
  }).populate('seller.userId', 'anonymousId profile.reputation');

  res.json({
    success: true,
    message: 'Watchlist retrieved successfully',
    data: {
      auctions
    }
  });
}));

module.exports = router;