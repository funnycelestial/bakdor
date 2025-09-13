// controllers/marketController.js
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const logger = require('../utils/logger');

// Helper imports
const ApiError = require('../utils/apiError');
const { SELLER_PUBLIC_FIELDS } = require('../utils/auctionHelpers');

// Get live auctions
const getLiveAuctions = async (filters = {}) => {
  const {
    page = 1,
    limit = 20,
    sort = 'ending_soon'
  } = filters;
  
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;
  
  const now = new Date();
  
  // Build query for live auctions
  const query = {
    status: 'active',
    'moderation.isApproved': true,
    'timing.startTime': { $lte: now },
    'timing.endTime': { $gte: now }
  };
  
  // Sorting
  let sortQuery = {};
  switch (sort) {
    case 'newest':
      sortQuery = { createdAt: -1 };
      break;
    case 'ending_soon':
      sortQuery = { 'timing.endTime': 1 };
      break;
    case 'price_low':
      sortQuery = { 'pricing.currentBid': 1 };
      break;
    case 'price_high':
      sortQuery = { 'pricing.currentBid': -1 };
      break;
    case 'most_bids':
      sortQuery = { 'bidding.totalBids': -1 };
      break;
    default:
      sortQuery = { 'timing.endTime': 1 };
  }
  
  // Fetch auctions and total count concurrently
  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('seller.userId', SELLER_PUBLIC_FIELDS)
      .select('-seller.walletAddress -blockchain'),
    Auction.countDocuments(query)
  ]);
  
  return {
    auctions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    filters: {
      sort
    }
  };
};

// Get filtered auctions
const getFilteredAuctions = async (filters = {}) => {
  const {
    category,
    type,
    status,
    timeFilter,
    page = 1,
    limit = 20,
    sort = 'newest',
    price_min,
    price_max,
    condition,
    minBids,
    hasBuyNow,
    hasReserve,
    userRole // For moderator access
  } = filters;
  
  // Ensure numeric safety
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;
  
  // Build query
  const query = {};
  
  if (category && category !== 'all') {
    query.category = category;
  }
  
  if (type && type !== 'all') {
    query.type = type;
  }
  
  if (status && status !== 'all') {
    query.status = status;
  } else {
    query.status = 'active'; // Default to active if not specified
  }
  
  // Time-based filter
  if (timeFilter && timeFilter !== 'any') {
    const now = new Date();
    let endTime;
    
    switch (timeFilter) {
      case 'next_hour':
        endTime = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'next_6h':
        endTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        break;
      case 'next_24h':
        endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'next_7d':
        endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        endTime = null;
    }
    
    if (endTime) {
      query['timing.endTime'] = { $lte: endTime };
    }
  }
  
  // Price range filter
  const minPrice = parseFloat(price_min);
  const maxPrice = parseFloat(price_max);
  if (!isNaN(minPrice) || !isNaN(maxPrice)) {
    query['pricing.currentBid'] = {};
    if (!isNaN(minPrice)) query['pricing.currentBid'].$gte = minPrice;
    if (!isNaN(maxPrice)) query['pricing.currentBid'].$lte = maxPrice;
  }
  
  // Item condition filter
  if (condition && condition !== 'any') {
    query['specifications.condition'] = condition;
  }
  
  // Minimum bids filter
  if (minBids) {
    query['bidding.totalBids'] = { $gte: parseInt(minBids) };
  }
  
  // Special features filters
  if (hasBuyNow) {
    query['pricing.buyNowPrice'] = { $gt: 0 };
  }
  
  if (hasReserve) {
    query['pricing.reservePrice'] = { $gt: 0 };
  }
  
  // Only show approved auctions to non-moderators
  if (!userRole || !userRole.includes('moderator')) {
    query['moderation.isApproved'] = true;
  }
  
  // Sorting
  let sortQuery = {};
  switch (sort) {
    case 'newest':
      sortQuery = { createdAt: -1 };
      break;
    case 'oldest':
      sortQuery = { createdAt: 1 };
      break;
    case 'ending_soon':
      sortQuery = { 'timing.endTime': 1 };
      break;
    case 'price_low':
      sortQuery = { 'pricing.currentBid': 1 };
      break;
    case 'price_high':
      sortQuery = { 'pricing.currentBid': -1 };
      break;
    case 'most_bids':
      sortQuery = { 'bidding.totalBids': -1 };
      break;
    default:
      sortQuery = { createdAt: -1 };
  }
  
  // Fetch auctions and total count concurrently
  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('seller.userId', SELLER_PUBLIC_FIELDS)
      .select('-seller.walletAddress -blockchain'),
    Auction.countDocuments(query)
  ]);
  
  return {
    auctions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    filters: {
      category,
      type,
      status,
      timeFilter,
      price_min,
      price_max,
      condition,
      minBids,
      hasBuyNow,
      hasReserve
    }
  };
};

// Search auctions with MongoDB full-text search
const searchAuctions = async (searchParams, userId = null) => {
  const { 
    q, 
    category, 
    price_min, 
    price_max, 
    type,
    condition,
    hasBuyNow,
    hasReserve,
    minBids,
    page = 1,
    limit = 20,
    sort = 'relevance'
  } = searchParams;
  
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;
  
  // Base filters
  const filters = {
    status: 'active',
    'moderation.isApproved': true
  };
  
  // If query string provided, use MongoDB full-text search
  if (q) {
    filters.$text = { $search: q };
  }
  
  // Category filter
  if (category && category !== 'all') {
    filters.category = category;
  }
  
  // Type filter
  if (type && type !== 'all') {
    filters.type = type;
  }
  
  // Condition filter
  if (condition && condition !== 'any') {
    filters['specifications.condition'] = condition;
  }
  
  // Buy Now filter
  if (hasBuyNow) {
    filters['pricing.buyNowPrice'] = { $gt: 0 };
  }
  
  // Reserve price filter
  if (hasReserve) {
    filters['pricing.reservePrice'] = { $gt: 0 };
  }
  
  // Minimum bids filter
  if (minBids) {
    filters['bidding.totalBids'] = { $gte: parseInt(minBids) };
  }
  
  // Price range filter
  if (price_min || price_max) {
    filters['pricing.currentBid'] = {};
    if (price_min) filters['pricing.currentBid'].$gte = parseFloat(price_min);
    if (price_max) filters['pricing.currentBid'].$lte = parseFloat(price_max);
  }
  
  // Sorting configuration
  const sortQuery = {};
  if (sort === 'relevance' && q) {
    sortQuery.score = { $meta: "textScore" }; // Sort by relevance when text search is used
  } else {
    switch (sort) {
      case 'newest':
        sortQuery.createdAt = -1;
        break;
      case 'ending_soon':
        sortQuery['timing.endTime'] = 1;
        break;
      case 'price_low':
        sortQuery['pricing.currentBid'] = 1;
        break;
      case 'price_high':
        sortQuery['pricing.currentBid'] = -1;
        break;
      case 'most_bids':
        sortQuery['bidding.totalBids'] = -1;
        break;
      default:
        sortQuery.createdAt = -1; // Default to newest if no relevance sort
    }
  }
  
  // Projection configuration - include text score when sorting by relevance
  const projection = q && sort === 'relevance' 
    ? { score: { $meta: 'textScore' } } 
    : {};
  
  const [auctions, total] = await Promise.all([
    Auction.find(filters, projection)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('seller.userId', 'anonymousId profile.reputation')
      .select('-seller.walletAddress -blockchain -moderation'),
    Auction.countDocuments(filters)
  ]);
  
  // Add watching status and convert to objects
  const auctionsWithExtras = auctions.map((auction) => {
    const auctionObj = auction.toObject();
    if (userId) {
      auctionObj.isWatching = auction.watchers.some(
        (w) => w.toString() === userId.toString()
      );
    }
    return auctionObj;
  });
  
  return {
    auctions: auctionsWithExtras,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    criteria: {
      q: q || null,
      category: category || 'all',
      type: type || 'all',
      condition: condition || 'any',
      hasBuyNow: hasBuyNow || false,
      hasReserve: hasReserve || false,
      minBids: minBids || null,
      price_min: price_min || null,
      price_max: price_max || null,
      sort
    }
  };
};

// Get auctions ending soon
const getEndingSoonAuctions = async (hours = 1, limit = 20) => {
  const now = new Date();
  const endTime = new Date(now.getTime() + (parseInt(hours) * 60 * 60 * 1000));
  
  const endingSoonAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true,
    'timing.endTime': { $gte: now, $lte: endTime }
  })
    .sort({ 'timing.endTime': 1 })
    .limit(parseInt(limit))
    .populate('seller.userId', SELLER_PUBLIC_FIELDS)
    .select('-seller.walletAddress -blockchain');
  
  // Calculate time remaining for each auction
  const auctionsWithTimeRemaining = endingSoonAuctions.map(auction => {
    const auctionObj = auction.toObject();
    const timeRemaining = new Date(auction.timing.endTime) - now;
    
    // Format time remaining
    const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      ...auctionObj,
      timeRemaining: {
        total: timeRemaining,
        formatted: `${days}d ${hoursRemaining}h ${minutesRemaining}m`,
        days,
        hours: hoursRemaining,
        minutes: minutesRemaining
      }
    };
  });
  
  logger.market('ending_soon_retrieved', {
    count: auctionsWithTimeRemaining.length,
    hours,
    limit
  });
  
  return {
    auctions: auctionsWithTimeRemaining,
    timeframe: `${hours} hour(s)`,
    total: auctionsWithTimeRemaining.length
  };
};

// Get trending auctions
const getTrendingAuctions = async (limit = 20) => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Get auctions with high activity in the last 24 hours
  const trendingAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true
  })
    .sort({ 
      'bidding.totalBids': -1, 
      'analytics.views': -1,
      'analytics.watchers': -1
    })
    .limit(limit)
    .populate('seller.userId', SELLER_PUBLIC_FIELDS)
    .select('-seller.walletAddress -blockchain -moderation');
  
  // Calculate trending score for each auction
  const auctionsWithScores = await Promise.all(
    trendingAuctions.map(async (auction) => {
      // Get recent bid activity
      const Bid = require('../models/bidModel');
      const recentBids = await Bid.countDocuments({
        'auction.auctionRef': auction._id,
        createdAt: { $gte: last24Hours }
      });
      
      // Calculate trending score (weighted combination of factors)
      const bidScore = Math.min(auction.bidding.totalBids / 10, 1) * 0.4; // 40% weight
      const viewScore = Math.min(auction.analytics.views / 100, 1) * 0.3; // 30% weight
      const watcherScore = Math.min(auction.analytics.watchers / 20, 1) * 0.2; // 20% weight
      const recentActivityScore = Math.min(recentBids / 5, 1) * 0.1; // 10% weight
      
      const trendingScore = bidScore + viewScore + watcherScore + recentActivityScore;
      
      return {
        ...auction.toObject(),
        trendingScore,
        recentBids
      };
    })
  );
  
  // Sort by trending score
  auctionsWithScores.sort((a, b) => b.trendingScore - a.trendingScore);
  
  logger.market('trending_retrieved', {
    count: auctionsWithScores.length,
    limit
  });
  
  return {
    auctions: auctionsWithScores,
    timeframe: 'Last 24 hours',
    criteria: 'Bids, views, watchers, and recent activity'
  };
};

// Get featured auctions
const getFeaturedAuctions = async (limit = 10) => {
  const featuredAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true,
    'pricing.buyNowPrice': { $gt: 0 } // Has buy now option
  })
    .sort({ 'bidding.totalBids': -1, 'analytics.views': -1 })
    .limit(limit)
    .populate('seller.userId', SELLER_PUBLIC_FIELDS)
    .select('-seller.walletAddress -blockchain -moderation');
  
  logger.market('featured_retrieved', {
    count: featuredAuctions.length,
    limit
  });
  
  return {
    auctions: featuredAuctions,
    criteria: 'Auctions with Buy Now option, sorted by popularity'
  };
};

// Get reverse auctions
const getReverseAuctions = async (filters = {}) => {
  const {
    page = 1,
    limit = 20,
    sort = 'ending_soon'
  } = filters;
  
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;
  
  const query = {
    type: 'reverse',
    status: 'active',
    'moderation.isApproved': true
  };
  
  // Sorting
  let sortQuery = {};
  switch (sort) {
    case 'newest':
      sortQuery = { createdAt: -1 };
      break;
    case 'ending_soon':
      sortQuery = { 'timing.endTime': 1 };
      break;
    case 'price_low':
      sortQuery = { 'pricing.currentBid': 1 };
      break;
    case 'price_high':
      sortQuery = { 'pricing.currentBid': -1 };
      break;
    case 'most_bids':
      sortQuery = { 'bidding.totalBids': -1 };
      break;
    default:
      sortQuery = { 'timing.endTime': 1 };
  }
  
  // Fetch auctions and total count concurrently
  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('seller.userId', SELLER_PUBLIC_FIELDS)
      .select('-seller.walletAddress -blockchain'),
    Auction.countDocuments(query)
  ]);
  
  return {
    auctions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    filters: {
      sort
    }
  };
};

// Get auction categories
const getCategories = async () => {
  const categories = await Auction.aggregate([
    { $match: { status: 'active', 'moderation.isApproved': true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  const formattedCategories = categories.map(cat => ({
    name: cat._id,
    count: cat.count
  }));
  
  return { categories: formattedCategories };
};

module.exports = {
  getLiveAuctions,
  getFilteredAuctions,
  searchAuctions,
  getEndingSoonAuctions,
  getTrendingAuctions,
  getFeaturedAuctions,
  getReverseAuctions,
  getCategories
};