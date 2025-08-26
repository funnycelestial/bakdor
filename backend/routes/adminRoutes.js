const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const User = require('../models/userModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const Notification = require('../models/notificationModel');
const { adminAuth, moderatorAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { 
  getPendingApprovals, 
  approveAuction, 
  rejectAuction, 
  getApprovalQueue, 
  autoApproveLowRisk 
} = require('../controllers/adminApprovalController');

const router = express.Router();

// @route   GET /api/v1/admin/dashboard
// @desc    Get admin dashboard data
// @access  Admin
router.get('/dashboard', adminAuth, asyncHandler(async (req, res) => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get platform statistics
  const [
    totalUsers,
    activeUsers24h,
    totalAuctions,
    activeAuctions,
    totalBids24h,
    totalTransactions24h,
    platformRevenue7d,
    pendingApprovals,
    openDisputes
  ] = await Promise.all([
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ lastActivity: { $gte: last24Hours } }),
    Auction.countDocuments(),
    Auction.countDocuments({ status: 'active' }),
    Bid.countDocuments({ 'timing.placedAt': { $gte: last24Hours } }),
    TokenTransaction.countDocuments({ createdAt: { $gte: last24Hours } }),
    TokenTransaction.aggregate([
      { $match: { type: 'fee_payment', createdAt: { $gte: last7Days } } },
      { $group: { _id: null, total: { $sum: '$fees.treasuryAmount' } } }
    ]),
    Auction.countDocuments({ status: 'pending', 'moderation.isApproved': false }),
    require('mongoose').model('Dispute').countDocuments({ status: { $in: ['open', 'investigating'] } })
  ]);

  // Get token statistics
  const tokenStats = await TokenTransaction.getPlatformStats(7);
  
  // Calculate token metrics
  let totalTokensIssued = 0;
  let totalTokensBurned = 0;
  let totalFeesCollected = 0;

  tokenStats.forEach(stat => {
    if (stat._id === 'deposit') totalTokensIssued += stat.totalAmount;
    if (stat._id === 'fee_burn') totalTokensBurned += stat.totalBurned;
    if (stat._id === 'fee_payment') totalFeesCollected += stat.totalFees;
  });

  // Get recent activity
  const recentActivity = await Promise.all([
    Auction.find({ status: 'pending' })
      .populate('seller.userId', 'anonymousId')
      .sort({ createdAt: -1 })
      .limit(5),
    User.find({ 'profile.isVerified': false, status: 'active' })
      .sort({ createdAt: -1 })
      .limit(5)
  ]);

  const dashboardData = {
    overview: {
      totalUsers,
      activeUsers24h,
      totalAuctions,
      activeAuctions,
      totalBids24h,
      totalTransactions24h,
      pendingApprovals,
      openDisputes
    },
    tokenEconomy: {
      totalTokensIssued,
      totalTokensBurned,
      totalFeesCollected,
      burnRate: totalTokensIssued > 0 ? (totalTokensBurned / totalTokensIssued * 100).toFixed(2) : 0,
      platformRevenue: platformRevenue7d[0]?.total || 0
    },
    pendingActions: {
      auctionApprovals: recentActivity[0],
      userVerifications: recentActivity[1]
    },
    systemHealth: {
      serverStatus: 'online',
      databaseStatus: 'healthy',
      blockchainStatus: 'connected',
      redisStatus: 'connected'
    }
  };

  res.json({
    success: true,
    message: 'Admin dashboard data retrieved successfully',
    data: dashboardData
  });
}));

// @route   GET /api/v1/admin/statistics
// @desc    Get platform statistics
// @access  Admin
router.get('/statistics', [
  adminAuth,
  query('period').optional().isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid period')
], asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;
  
  let startDate = new Date();
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

  // Get comprehensive statistics
  const [userStats, auctionStats, bidStats, transactionStats] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          newUsers: { $sum: 1 },
          verifiedUsers: { $sum: { $cond: ['$profile.isVerified', 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Auction.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAuctions: { $sum: 1 },
          activeAuctions: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          endedAuctions: { $sum: { $cond: [{ $eq: ['$status', 'ended'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Bid.aggregate([
      { $match: { 'timing.placedAt': { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timing.placedAt" } },
          totalBids: { $sum: 1 },
          totalValue: { $sum: '$amount' },
          uniqueBidders: { $addToSet: '$bidder.userId' }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    TokenTransaction.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: '$type'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalFees: { $sum: '$fees.platformFee' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ])
  ]);

  res.json({
    success: true,
    message: 'Platform statistics retrieved successfully',
    data: {
      period,
      userStats,
      auctionStats,
      bidStats,
      transactionStats,
      summary: {
        totalNewUsers: userStats.reduce((sum, day) => sum + day.newUsers, 0),
        totalNewAuctions: auctionStats.reduce((sum, day) => sum + day.totalAuctions, 0),
        totalBidsValue: bidStats.reduce((sum, day) => sum + day.totalValue, 0),
        totalTransactionVolume: transactionStats.reduce((sum, day) => sum + Math.abs(day.totalAmount), 0)
      }
    }
  });
}));

// @route   GET /api/v1/admin/auctions/pending
// @desc    Get pending auctions for approval
// @access  Moderator
router.get('/auctions/pending', [
  moderatorAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [auctions, total] = await Promise.all([
    Auction.find({ 
      status: 'pending',
      'moderation.isApproved': false 
    })
    .populate('seller.userId', 'anonymousId profile.reputation profile.memberSince')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(parseInt(limit)),
    Auction.countDocuments({ 
      status: 'pending',
      'moderation.isApproved': false 
    })
  ]);

  res.json({
    success: true,
    message: 'Pending auctions retrieved successfully',
    data: {
      auctions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// @route   GET /api/v1/admin/pending-approvals
// @desc    Get pending auction approvals with risk assessment
// @access  Moderator
router.get('/pending-approvals', [
  moderatorAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  query('type').optional().isIn(['forward', 'reverse'])
], getPendingApprovals);

// @route   GET /api/v1/admin/approval-queue
// @desc    Get prioritized approval queue
// @access  Moderator
router.get('/approval-queue', moderatorAuth, getApprovalQueue);

// @route   POST /api/v1/admin/approve-auction/:id
// @desc    Approve specific auction
// @access  Moderator
router.post('/approve-auction/:id', [
  moderatorAuth,
  param('id').isMongoId().withMessage('Invalid auction ID'),
  body('notes').optional().isString().isLength({ max: 500 })
], approveAuction);

// @route   POST /api/v1/admin/reject-auction/:id
// @desc    Reject specific auction
// @access  Moderator
router.post('/reject-auction/:id', [
  moderatorAuth,
  param('id').isMongoId().withMessage('Invalid auction ID'),
  body('reason').isString().isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be between 10 and 500 characters')
], rejectAuction);

// @route   POST /api/v1/admin/bulk-approve
// @desc    Bulk approve auctions
// @access  Admin
router.post('/bulk-approve', [
  adminAuth,
  body('auctionIds').isArray().withMessage('Auction IDs must be an array'),
  body('auctionIds.*').isMongoId().withMessage('Invalid auction ID'),
  body('notes').optional().isString().isLength({ max: 500 })
], require('../controllers/adminApprovalController').bulkApproveAuctions);

// @route   POST /api/v1/admin/auto-approve
// @desc    Auto-approve low-risk auctions
// @access  Admin
router.post('/auto-approve', [
  adminAuth,
  body('dryRun').optional().isBoolean()
], autoApproveLowRisk);

// @route   GET /api/v1/admin/approval-stats
// @desc    Get approval statistics
// @access  Admin
router.get('/approval-stats', [
  adminAuth,
  query('period').optional().isIn(['24h', '7d', '30d'])
], require('../controllers/adminApprovalController').getApprovalStats);

// @route   POST /api/v1/admin/auctions/:id/approve
// @desc    Approve auction
// @access  Moderator
router.post('/auctions/:auctionId/approve', [
  moderatorAuth,
  param('auctionId').isMongoId().withMessage('Invalid auction ID'),
  body('notes').optional().isString().isLength({ max: 500 })
], asyncHandler(async (req, res) => {
  const { notes } = req.body;
  
  const auction = await Auction.findById(req.params.auctionId);
  if (!auction) {
    throw new NotFoundError('Auction not found');
  }

  if (auction.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Auction is not pending approval',
      data: null
    });
  }

  // Approve auction
  auction.status = 'active';
  auction.moderation.isApproved = true;
  auction.moderation.approvedBy = req.user.userId;
  auction.moderation.approvedAt = new Date();
  if (notes) auction.moderation.notes = notes;

  await auction.save();

  // Create notification for seller
  const notification = new Notification({
    recipient: {
      userId: auction.seller.userId,
      anonymousId: auction.seller.anonymousId
    },
    type: 'auction_approved',
    priority: 'medium',
    title: 'Auction Approved',
    message: `Your auction "${auction.title}" has been approved and is now live.`,
    data: {
      auctionId: auction.auctionId,
      auctionTitle: auction.title
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });

  await notification.save();

  logger.auction('approved', auction.auctionId, {
    approvedBy: req.user.userId,
    sellerId: auction.seller.userId
  });

  res.json({
    success: true,
    message: 'Auction approved successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        status: auction.status,
        approvedAt: auction.moderation.approvedAt
      }
    }
  });
}));

// @route   POST /api/v1/admin/auctions/:id/reject
// @desc    Reject auction
// @access  Moderator
router.post('/auctions/:auctionId/reject', [
  moderatorAuth,
  param('auctionId').isMongoId().withMessage('Invalid auction ID'),
  body('reason').isString().isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be between 10 and 500 characters')
], asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const auction = await Auction.findById(req.params.auctionId);
  if (!auction) {
    throw new NotFoundError('Auction not found');
  }

  if (auction.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Auction is not pending approval',
      data: null
    });
  }

  // Reject auction
  auction.status = 'cancelled';
  auction.moderation.isApproved = false;
  auction.moderation.rejectionReason = reason;
  auction.moderation.approvedBy = req.user.userId;
  auction.moderation.approvedAt = new Date();

  await auction.save();

  // Create notification for seller
  const notification = new Notification({
    recipient: {
      userId: auction.seller.userId,
      anonymousId: auction.seller.anonymousId
    },
    type: 'auction_rejected',
    priority: 'high',
    title: 'Auction Rejected',
    message: `Your auction "${auction.title}" has been rejected. Reason: ${reason}`,
    data: {
      auctionId: auction.auctionId,
      auctionTitle: auction.title,
      rejectionReason: reason
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });

  await notification.save();

  logger.auction('rejected', auction.auctionId, {
    rejectedBy: req.user.userId,
    sellerId: auction.seller.userId,
    reason
  });

  res.json({
    success: true,
    message: 'Auction rejected successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        status: auction.status,
        rejectionReason: reason
      }
    }
  });
}));

// @route   GET /api/v1/admin/users
// @desc    Get all users (admin view)
// @access  Admin
router.get('/users', [
  adminAuth,
  query('status').optional().isIn(['active', 'suspended', 'banned', 'pending']),
  query('verified').optional().isBoolean(),
  query('search').optional().isString(),
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

  const { status, verified, search, page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {};
  if (status) query.status = status;
  if (verified !== undefined) query['profile.isVerified'] = verified === 'true';
  
  if (search) {
    query.$or = [
      { anonymousId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { walletAddress: { $regex: search, $options: 'i' } }
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select('-security.twoFactorSecret')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    User.countDocuments(query)
  ]);

  res.json({
    success: true,
    message: 'Users retrieved successfully',
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// @route   PUT /api/v1/admin/users/:id/status
// @desc    Update user status
// @access  Admin
router.put('/users/:userId/status', [
  adminAuth,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('status').isIn(['active', 'suspended', 'banned']).withMessage('Invalid status'),
  body('reason').optional().isString().isLength({ max: 500 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }

  const { status, reason } = req.body;
  
  const user = await User.findById(req.params.userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const oldStatus = user.status;
  user.status = status;
  await user.save();

  // Create notification for user
  const notification = new Notification({
    recipient: {
      userId: user._id,
      anonymousId: user.anonymousId
    },
    type: 'account_status_changed',
    priority: status === 'banned' ? 'urgent' : 'high',
    title: 'Account Status Updated',
    message: `Your account status has been changed to ${status}. ${reason ? `Reason: ${reason}` : ''}`,
    data: {
      oldStatus,
      newStatus: status,
      reason
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });

  await notification.save();

  logger.user('status_changed', user._id, {
    changedBy: req.user.userId,
    oldStatus,
    newStatus: status,
    reason
  });

  res.json({
    success: true,
    message: 'User status updated successfully',
    data: {
      user: {
        id: user._id,
        anonymousId: user.anonymousId,
        status: user.status,
        updatedAt: new Date()
      }
    }
  });
}));

// @route   GET /api/v1/admin/system/health
// @desc    Get system health status
// @access  Admin
router.get('/system/health', adminAuth, asyncHandler(async (req, res) => {
  const healthChecks = {
    database: 'healthy',
    redis: 'healthy',
    blockchain: 'connected',
    socketIO: 'active',
    emailService: 'operational',
    fileStorage: 'available'
  };

  // Perform actual health checks
  try {
    // Check database
    await require('mongoose').connection.db.admin().ping();
  } catch (error) {
    healthChecks.database = 'error';
  }

  try {
    // Check Redis
    await require('../config/redis').ping();
  } catch (error) {
    healthChecks.redis = 'error';
  }

  try {
    // Check blockchain connection
    await require('../services/web3Service').getCurrentBlockNumber();
  } catch (error) {
    healthChecks.blockchain = 'error';
  }

  const overallHealth = Object.values(healthChecks).every(status => 
    ['healthy', 'connected', 'active', 'operational', 'available'].includes(status)
  ) ? 'healthy' : 'degraded';

  res.json({
    success: true,
    message: 'System health retrieved successfully',
    data: {
      overallHealth,
      services: healthChecks,
      timestamp: new Date(),
      uptime: process.uptime()
    }
  });
}));

module.exports = router;