// controllers/overviewController.js
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const logger = require('../utils/logger');

// Get platform overview statistics
const getPlatformOverview = async () => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Get basic counts
  const [
    totalUsers,
    activeAuctions,
    totalAuctions,
    totalBids
  ] = await Promise.all([
    User.countDocuments(),
    Auction.countDocuments({ status: 'active' }),
    Auction.countDocuments(),
    Bid.countDocuments()
  ]);
  
  // Get active bidders (users who bid in last 24 hours)
  const activeBidders = await User.countDocuments({ lastActivity: { $gte: last24Hours } });
  
  // Get tokens in play (sum of all active auction current bids)
  const tokensInPlayResult = await Bid.aggregate([
    { $match: { status: { $in: ['active', 'winning'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const tokensInPlay = tokensInPlayResult[0]?.total || 0;
  
  // Get average bid value
  const avgBidValueResult = await Bid.aggregate([
    { $match: { status: { $in: ['active', 'winning'] } } },
    { $group: { _id: null, avg: { $avg: '$amount' } } }
  ]);
  const avgBidValue = Math.round(avgBidValueResult[0]?.avg || 0);
  
  // Calculate success rate
  const [completedAuctions, successfulAuctions] = await Promise.all([
    Auction.countDocuments({ status: 'ended' }),
    Auction.countDocuments({ status: 'ended', 'winner.userId': { $exists: true } })
  ]);
  const successRate = completedAuctions > 0 ? 
    Math.round((successfulAuctions / completedAuctions) * 100) : 0;
  
  // Get tokens burned today
  const tokensBurnedTodayResult = await TokenTransaction.aggregate([
    { $match: { 
      type: 'fee_burn', 
      createdAt: { $gte: last24Hours } 
    }},
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const tokensBurnedToday = tokensBurnedTodayResult[0]?.total || 0;
  
  // Get total tokens burned
  const totalTokensBurnedResult = await TokenTransaction.aggregate([
    { $match: { 
      type: 'fee_burn'
    }},
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalTokensBurned = totalTokensBurnedResult[0]?.total || 0;
  
  // Get auctions ending in the next hour
  const endingSoon = await Auction.countDocuments({
    status: 'active',
    'timing.endTime': { $lte: new Date(now.getTime() + 60 * 60 * 1000) }
  });
  
  // Get new auctions in the last 24 hours
  const newAuctionsToday = await Auction.countDocuments({
    createdAt: { $gte: last24Hours }
  });
  
  // Get platform volume (total transaction value) in the last 24 hours
  const volume24hResult = await TokenTransaction.aggregate([
    { 
      $match: { 
        createdAt: { $gte: last24Hours },
        type: { $in: ['bid_lock', 'escrow_lock'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const volume24h = volume24hResult[0]?.total || 0;
  
  // Get platform volume in the last 7 days
  const volume7dResult = await TokenTransaction.aggregate([
    { 
      $match: { 
        createdAt: { $gte: last7Days },
        type: { $in: ['bid_lock', 'escrow_lock'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const volume7d = volume7dResult[0]?.total || 0;
  
  // Get total platform volume
  const totalVolumeResult = await TokenTransaction.aggregate([
    { 
      $match: { 
        type: { $in: ['bid_lock', 'escrow_lock'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalVolume = totalVolumeResult[0]?.total || 0;
  
  // Get top categories by auction count
  const topCategories = await Auction.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);
  
  // Get growth metrics (new users in last 7 days vs previous 7 days)
  const prev7DaysStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const [newUsersThisWeek, newUsersLastWeek] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: last7Days } }),
    User.countDocuments({ createdAt: { $gte: prev7DaysStart, $lt: last7Days } })
  ]);
  const userGrowth = newUsersLastWeek > 0 ? 
    Math.round(((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100) : 0;
  
  logger.overview('retrieved', {
    totalUsers,
    activeAuctions,
    tokensInPlay,
    volume24h
  });
  
  return {
    users: {
      total: totalUsers,
      active: activeBidders,
      growth: userGrowth
    },
    auctions: {
      total: totalAuctions,
      active: activeAuctions,
      endingSoon,
      newToday: newAuctionsToday,
      successRate
    },
    tokens: {
      inPlay: tokensInPlay,
      burnedToday: tokensBurnedToday,
      totalBurned: totalTokensBurned
    },
    volume: {
      total: totalVolume,
      last24Hours: volume24h,
      last7Days: volume7d
    },
    bidding: {
      totalBids,
      averageBid: avgBidValue
    },
    topCategories,
    timestamp: now
  };
};

// Get platform health status
const getPlatformHealth = async () => {
  const now = new Date();
  const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
  
  // Check recent activity
  const [
    recentAuctions,
    recentBids,
    recentUsers
  ] = await Promise.all([
    Auction.countDocuments({ createdAt: { $gte: last5Minutes } }),
    Bid.countDocuments({ createdAt: { $gte: last5Minutes } }),
    User.countDocuments({ createdAt: { $gte: last5Minutes } })
  ]);
  
  // Get system status (could be expanded with actual health checks)
  const status = {
    overall: 'healthy',
    database: 'healthy',
    blockchain: 'healthy', // This could be enhanced with actual blockchain node checks
    api: 'healthy'
  };
  
  // If no recent activity, might indicate issues
  if (recentAuctions === 0 && recentBids === 0 && recentUsers === 0) {
    status.overall = 'warning';
    status.message = 'No recent activity detected';
  }
  
  return {
    status,
    metrics: {
      recentAuctions,
      recentBids,
      recentUsers
    },
    timestamp: now
  };
};

module.exports = {
  getPlatformOverview,
  getPlatformHealth
};