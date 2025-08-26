// controllers/adminApprovalController.js
const mongoose = require('mongoose');
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const webSocketController = require('./webSocketController');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// @route   GET /api/v1/admin/pending-approvals
// @desc    Get all pending auction approvals
// @access  Admin/Moderator
const getPendingApprovals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, type } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    status: 'pending',
    'moderation.isApproved': false,
  };

  if (category) query.category = category;
  if (type) query.type = type;

  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .populate(
        'seller.userId',
        'anonymousId profile.reputation profile.memberSince'
      )
      .sort({ createdAt: 1 }) // Oldest first for FIFO processing
      .skip(skip)
      .limit(parseInt(limit)),
    Auction.countDocuments(query),
  ]);

  // Add risk assessment for each auction
  const auctionsWithRisk = await Promise.all(
    auctions.map(async (auction) => {
      const auctionObj = auction.toObject();

      // Calculate risk score
      let riskScore = 0;

      // New seller risk
      if (auction.seller.userId.profile.totalAuctions < 5) {
        riskScore += 20;
      }

      // High value risk
      if (auction.pricing.startingBid > 5000) {
        riskScore += 15;
      }

      // Category risk (some categories are higher risk)
      const highRiskCategories = ['electronics', 'automotive', 'art'];
      if (highRiskCategories.includes(auction.category)) {
        riskScore += 10;
      }

      // Reputation risk
      if (auction.seller.userId.profile.reputation < 3.0) {
        riskScore += 25;
      }

      auctionObj.riskAssessment = {
        score: Math.min(100, riskScore),
        level: riskScore > 50 ? 'high' : riskScore > 25 ? 'medium' : 'low',
        factors: [],
      };

      if (auction.seller.userId.profile.totalAuctions < 5) {
        auctionObj.riskAssessment.factors.push('New seller');
      }
      if (auction.pricing.startingBid > 5000) {
        auctionObj.riskAssessment.factors.push('High value item');
      }
      if (auction.seller.userId.profile.reputation < 3.0) {
        auctionObj.riskAssessment.factors.push('Low reputation');
      }

      return auctionObj;
    })
  );

  res.json({
    success: true,
    message: 'Pending approvals retrieved successfully',
    data: {
      auctions: auctionsWithRisk,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      summary: {
        totalPending: total,
        highRisk: auctionsWithRisk.filter(
          (a) => a.riskAssessment.level === 'high'
        ).length,
        mediumRisk: auctionsWithRisk.filter(
          (a) => a.riskAssessment.level === 'medium'
        ).length,
        lowRisk: auctionsWithRisk.filter(
          (a) => a.riskAssessment.level === 'low'
        ).length,
      },
    },
  });
});

// @route   POST /api/v1/admin/approve-auction/:id
// @desc    Approve auction
// @access  Admin/Moderator
const approveAuction = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const auctionId = req.params.id;

  const auction = await Auction.findById(auctionId);
  if (!auction) {
    return res.status(404).json({
      success: false,
      message: 'Auction not found',
      data: null,
    });
  }

  if (auction.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Auction is not pending approval',
      data: null,
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
  await notificationService.sendNotification({
    recipient: {
      userId: auction.seller.userId,
      anonymousId: auction.seller.anonymousId,
    },
    type: 'auction_approved',
    priority: 'medium',
    title: 'Auction Approved',
    message: `Your auction "${auction.title}" has been approved and is now live.`,
    data: {
      auctionId: auction.auctionId,
      auctionTitle: auction.title,
      approvedBy: req.user.anonymousId,
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true },
    },
  });

  // Broadcast auction approval
  webSocketController.broadcastToAll('auction_approved', {
    auctionId: auction.auctionId,
    title: auction.title,
    category: auction.category,
    startingBid: auction.pricing.startingBid,
  });

  logger.auction('approved', auction.auctionId, {
    approvedBy: req.user.userId,
    sellerId: auction.seller.userId,
    notes,
  });

  res.json({
    success: true,
    message: 'Auction approved successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        status: auction.status,
        approvedAt: auction.moderation.approvedAt,
      },
    },
  });
});

// @route   POST /api/v1/admin/reject-auction/:id
// @desc    Reject auction
// @access  Admin/Moderator
const rejectAuction = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const auctionId = req.params.id;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason must be at least 10 characters',
      data: null,
    });
  }

  const auction = await Auction.findById(auctionId);
  if (!auction) {
    return res.status(404).json({
      success: false,
      message: 'Auction not found',
      data: null,
    });
  }

  if (auction.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Auction is not pending approval',
      data: null,
    });
  }

  // Reject auction
  auction.status = 'cancelled';
  auction.moderation.isApproved = false;
  auction.moderation.rejectionReason = reason.trim();
  auction.moderation.approvedBy = req.user.userId;
  auction.moderation.approvedAt = new Date();

  await auction.save();

  // Create notification for seller
  await notificationService.sendNotification({
    recipient: {
      userId: auction.seller.userId,
      anonymousId: auction.seller.anonymousId,
    },
    type: 'auction_rejected',
    priority: 'high',
    title: 'Auction Rejected',
    message: `Your auction "${auction.title}" has been rejected. Reason: ${reason}`,
    data: {
      auctionId: auction.auctionId,
      auctionTitle: auction.title,
      rejectionReason: reason,
      rejectedBy: req.user.anonymousId,
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true },
    },
  });

  // Send real-time update to seller
  webSocketController.sendToUser(auction.seller.userId, 'auction_rejected', {
    auctionId: auction.auctionId,
    reason,
  });

  logger.auction('rejected', auction.auctionId, {
    rejectedBy: req.user.userId,
    sellerId: auction.seller.userId,
    reason,
  });

  res.json({
    success: true,
    message: 'Auction rejected successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        status: auction.status,
        rejectionReason: reason,
      },
    },
  });
});

// @route   GET /api/v1/admin/approval-stats
// @desc    Get approval statistics
// @access  Admin
const getApprovalStats = asyncHandler(async (req, res) => {
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
  }

  const [approvalStats, categoryStats, moderatorStats] = await Promise.all([
    Auction.aggregate([
      { $match: { 'moderation.approvedAt': { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$moderation.approvedAt',
            },
          },
          approved: { $sum: { $cond: ['$moderation.isApproved', 1, 0] } },
          rejected: { $sum: { $cond: ['$moderation.isApproved', 0, 1] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Auction.aggregate([
      { $match: { 'moderation.approvedAt': { $gte: startDate } } },
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          approved: { $sum: { $cond: ['$moderation.isApproved', 1, 0] } },
          rejected: { $sum: { $cond: ['$moderation.isApproved', 0, 1] } },
        },
      },
    ]),
    Auction.aggregate([
      { $match: { 'moderation.approvedAt': { $gte: startDate } } },
      {
        $group: {
          _id: '$moderation.approvedBy',
          total: { $sum: 1 },
          approved: { $sum: { $cond: ['$moderation.isApproved', 1, 0] } },
          rejected: { $sum: { $cond: ['$moderation.isApproved', 0, 1] } },
        },
      },
    ]),
  ]);

  res.json({
    success: true,
    message: 'Approval statistics retrieved successfully',
    data: {
      period,
      approvalStats,
      categoryStats,
      moderatorStats,
      summary: {
        totalProcessed: approvalStats.reduce(
          (sum, day) => sum + day.approved + day.rejected,
          0
        ),
        totalApproved: approvalStats.reduce(
          (sum, day) => sum + day.approved,
          0
        ),
        totalRejected: approvalStats.reduce(
          (sum, day) => sum + day.rejected,
          0
        ),
        approvalRate:
          approvalStats.length > 0
            ? (
                (approvalStats.reduce((sum, day) => sum + day.approved, 0) /
                  approvalStats.reduce(
                    (sum, day) => sum + day.approved + day.rejected,
                    0
                  )) *
                100
              ).toFixed(1)
            : 0,
      },
    },
  });
});

// @route   POST /api/v1/admin/bulk-approve
// @desc    Bulk approve auctions
// @access  Admin
const bulkApproveAuctions = asyncHandler(async (req, res) => {
  const { auctionIds, notes } = req.body;

  if (!Array.isArray(auctionIds) || auctionIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Auction IDs array is required',
      data: null,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update all auctions
    const result = await Auction.updateMany(
      {
        _id: { $in: auctionIds },
        status: 'pending',
      },
      {
        $set: {
          status: 'active',
          'moderation.isApproved': true,
          'moderation.approvedBy': req.user.userId,
          'moderation.approvedAt': new Date(),
          'moderation.notes': notes,
        },
      },
      { session }
    );

    // Get approved auctions for notifications
    const approvedAuctions = await Auction.find({
      _id: { $in: auctionIds },
      status: 'active',
    }).session(session);

    await session.commitTransaction();

    // Send notifications to sellers
    for (const auction of approvedAuctions) {
      await notificationService.sendNotification({
        recipient: {
          userId: auction.seller.userId,
          anonymousId: auction.seller.anonymousId,
        },
        type: 'auction_approved',
        priority: 'medium',
        title: 'Auction Approved',
        message: `Your auction "${auction.title}" has been approved and is now live.`,
        data: {
          auctionId: auction.auctionId,
          auctionTitle: auction.title,
        },
        channels: {
          inApp: { enabled: true },
          email: { enabled: true },
        },
      });

      // Broadcast approval
      webSocketController.broadcastToAll('auction_approved', {
        auctionId: auction.auctionId,
        title: auction.title,
      });
    }

    logger.admin('bulk_approve', {
      approvedBy: req.user.userId,
      count: result.modifiedCount,
      auctionIds,
    });

    res.json({
      success: true,
      message: `${result.modifiedCount} auctions approved successfully`,
      data: {
        approvedCount: result.modifiedCount,
        totalRequested: auctionIds.length,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// @route   GET /api/v1/admin/approval-queue
// @desc    Get approval queue with priority sorting
// @access  Admin/Moderator
const getApprovalQueue = asyncHandler(async (req, res) => {
  const pendingAuctions = await Auction.find({
    status: 'pending',
    'moderation.isApproved': false,
  })
    .populate(
      'seller.userId',
      'anonymousId profile.reputation profile.totalAuctions'
    )
    .sort({ createdAt: 1 });

  // Sort by priority (high risk first, then by creation time)
  const prioritizedQueue = pendingAuctions
    .map((auction) => {
      let priority = 0;

      // High value items get higher priority
      if (auction.pricing.startingBid > 5000) priority += 3;

      // New sellers get higher priority (more scrutiny needed)
      if (auction.seller.userId.profile.totalAuctions < 5) priority += 2;

      // Low reputation sellers get higher priority
      if (auction.seller.userId.profile.reputation < 3.0) priority += 2;

      // Age factor (older items get slight priority boost)
      const ageHours =
        (Date.now() - auction.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) priority += 1;

      return {
        ...auction.toObject(),
        priority,
        waitingTime: ageHours,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  res.json({
    success: true,
    message: 'Approval queue retrieved successfully',
    data: {
      queue: prioritizedQueue,
      stats: {
        totalPending: pendingAuctions.length,
        averageWaitTime:
          prioritizedQueue.reduce((sum, a) => sum + a.waitingTime, 0) /
          prioritizedQueue.length,
        oldestPending: Math.max(...prioritizedQueue.map((a) => a.waitingTime)),
      },
    },
  });
});

// @route   POST /api/v1/admin/auto-approve
// @desc    Auto-approve low-risk auctions
// @access  Admin
const autoApproveLowRisk = asyncHandler(async (req, res) => {
  const { dryRun = false } = req.body;

  // Find low-risk auctions for auto-approval
  const lowRiskAuctions = await Auction.find({
    status: 'pending',
    'moderation.isApproved': false,
    'pricing.startingBid': { $lt: 1000 }, // Low value
    'seller.userId': {
      $in: await User.find({
        'profile.reputation': { $gte: 4.0 },
        'profile.totalAuctions': { $gte: 10 },
      }).distinct('_id'),
    },
  }).populate('seller.userId', 'anonymousId profile.reputation');

  if (dryRun) {
    return res.json({
      success: true,
      message: 'Dry run completed',
      data: {
        eligibleForAutoApproval: lowRiskAuctions.length,
        auctions: lowRiskAuctions.map((a) => ({
          auctionId: a.auctionId,
          title: a.title,
          seller: a.seller.userId.anonymousId,
          reputation: a.seller.userId.profile.reputation,
          startingBid: a.pricing.startingBid,
        })),
      },
    });
  }

  // Auto-approve eligible auctions
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const auctionIds = lowRiskAuctions.map((a) => a._id);

    const result = await Auction.updateMany(
      { _id: { $in: auctionIds } },
      {
        $set: {
          status: 'active',
          'moderation.isApproved': true,
          'moderation.approvedBy': req.user.userId,
          'moderation.approvedAt': new Date(),
          'moderation.notes': 'Auto-approved (low risk)',
        },
      },
      { session }
    );

    await session.commitTransaction();

    // Send notifications
    for (const auction of lowRiskAuctions) {
      await notificationService.sendNotification({
        recipient: {
          userId: auction.seller.userId._id,
          anonymousId: auction.seller.userId.anonymousId,
        },
        type: 'auction_approved',
        priority: 'medium',
        title: 'Auction Auto-Approved',
        message: `Your auction "${auction.title}" has been automatically approved and is now live.`,
        data: {
          auctionId: auction.auctionId,
          auctionTitle: auction.title,
          autoApproved: true,
        },
        channels: {
          inApp: { enabled: true },
          email: { enabled: true },
        },
      });
    }

    logger.admin('auto_approve', {
      approvedBy: req.user.userId,
      count: result.modifiedCount,
      criteria: 'low_risk',
    });

    res.json({
      success: true,
      message: `${result.modifiedCount} auctions auto-approved successfully`,
      data: {
        approvedCount: result.modifiedCount,
        totalEligible: lowRiskAuctions.length,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// In adminApprovalController.js
module.exports = {
  getPendingApprovals,
  approveAuction,
  rejectAuction,
  getApprovalStats, // Make sure this is exported
  bulkApproveAuctions, // Make sure this is exported
  getApprovalQueue,
  autoApproveLowRisk,
};
