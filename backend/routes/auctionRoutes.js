const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const Bid = require('../models/bidModel');
const { auth, optionalAuth, moderatorAuth } = require('../middleware/auth');
const { biddingLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const { uploadMultiple } = require('../middleware/upload');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/auctions
// @desc    Get all auctions with filters
// @access  Public
router.get('/',
  [
    optionalAuth,
    query('type').optional().isIn(['forward', 'reverse']),
    query('status').optional().isIn(['active', 'pending', 'ended', 'cancelled']),
    query('category').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isIn(['newest', 'oldest', 'ending_soon', 'price_low', 'price_high', 'most_bids']),
    query('search').optional().isString(),
    query('price_min').optional().isFloat({ min: 0 }),
    query('price_max').optional().isFloat({ min: 0 }),
    query('seller').optional().isString()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const {
      type,
      status = 'active',
      category,
      page = 1,
      limit = 20,
      sort = 'newest',
      search,
      price_min,
      price_max,
      seller
    } = req.query;

    // Build query
    const query = {};
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (category) query.category = category;
    if (seller) query['seller.userId'] = seller;
    
    // Price range filter
    if (price_min || price_max) {
      query['pricing.currentBid'] = {};
      if (price_min) query['pricing.currentBid'].$gte = parseFloat(price_min);
      if (price_max) query['pricing.currentBid'].$lte = parseFloat(price_max);
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'specifications.brand': { $regex: search, $options: 'i' } },
        { 'specifications.model': { $regex: search, $options: 'i' } }
      ];
    }

    // Only show approved auctions to non-moderators
    if (!req.user || !req.user.roles.includes('moderator')) {
      query['moderation.isApproved'] = true;
    }

    // Build sort
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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [auctions, total] = await Promise.all([
      Auction.find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('seller.userId', 'anonymousId profile.reputation')
        .select('-seller.walletAddress -blockchain'),
      Auction.countDocuments(query)
    ]);

    res.json({
      success: true,
      message: 'Auctions retrieved successfully',
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
  })
);

// @route   GET /api/v1/auctions/:id
// @desc    Get auction by ID
// @access  Public
router.get('/:auctionId',
  [
    optionalAuth,
    param('auctionId').isString().withMessage('Invalid auction ID')
  ],
  asyncHandler(async (req, res) => {
    const auction = await Auction.findOne({ auctionId: req.params.auctionId })
      .populate('seller.userId', 'anonymousId profile.reputation profile.memberSince')
      .populate('bidding.highestBidder.userId', 'anonymousId');

    if (!auction) {
      throw new NotFoundError('Auction not found');
    }

    // Check if auction is approved for non-moderators
    if ((!req.user || !req.user.roles.includes('moderator')) && !auction.moderation.isApproved) {
      throw new NotFoundError('Auction not found');
    }

    // Increment view count
    auction.analytics.views += 1;
    await auction.save();

    res.json({
      success: true,
      message: 'Auction retrieved successfully',
      data: {
        auction: {
          ...auction.toObject(),
          isWatching: req.user ? auction.watchers.some(w => w.userId.toString() === req.user.userId) : false
        }
      }
    });
  })
);

// @route   POST /api/v1/auctions
// @desc    Create new auction
// @access  Private
router.post('/',
  [
    auth,
    uploadMultiple('images', 10),
    body('title').isString().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
    body('description').isString().isLength({ min: 20, max: 2000 }).withMessage('Description must be between 20 and 2000 characters'),
    body('category').isIn(['electronics', 'fashion', 'home-garden', 'sports', 'automotive', 'books', 'art', 'collectibles', 'services', 'other']),
    body('type').optional().isIn(['forward', 'reverse']),
    body('startingBid').isFloat({ min: 0.01 }).withMessage('Starting bid must be greater than 0'),
    body('reservePrice').optional().isFloat({ min: 0 }),
    body('buyNowPrice').optional().isFloat({ min: 0 }),
    body('duration').isInt({ min: 3600000 }).withMessage('Duration must be at least 1 hour'),
    body('condition').isIn(['new', 'like-new', 'good', 'fair', 'poor'])
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const { 
      title, 
      description, 
      startingBid, 
      reservePrice = 0,
      buyNowPrice = 0,
      category, 
      condition, 
      type = 'forward',
      duration,
      brand,
      model,
      year,
      shippingMethod = 'standard',
      shippingCost = 0
    } = req.body;

    // Validate pricing
    if (reservePrice > 0 && reservePrice < startingBid) {
      return res.status(400).json({
        success: false,
        message: 'Reserve price cannot be less than starting bid',
        data: null
      });
    }

    if (buyNowPrice > 0 && buyNowPrice <= Math.max(startingBid, reservePrice)) {
      return res.status(400).json({
        success: false,
        message: 'Buy now price must be greater than starting bid and reserve price',
        data: null
      });
    }

    // Process uploaded images
    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        images.push({
          url: `/uploads/${file.filename}`,
          alt: `${title} - Image ${index + 1}`,
          isPrimary: index === 0
        });
      });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + parseInt(duration));

    const auction = new Auction({
      title,
      description,
      category,
      type,
      seller: {
        userId: req.user.userId,
        anonymousId: req.user.anonymousId,
        walletAddress: req.user.walletAddress
      },
      pricing: {
        startingBid,
        currentBid: type === 'reverse' ? startingBid : 0,
        reservePrice,
        buyNowPrice
      },
      timing: {
        startTime,
        endTime,
        duration: parseInt(duration)
      },
      images,
      specifications: {
        condition,
        brand,
        model,
        year: year ? parseInt(year) : undefined
      },
      shipping: {
        method: shippingMethod,
        cost: parseFloat(shippingCost)
      },
      status: 'pending'
    });

    await auction.save();

    // Update user's auction count
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { 'profile.totalAuctions': 1 }
    });

    logger.auction('created', auction.auctionId, {
      userId: req.user.userId,
      title,
      category,
      startingBid
    });

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: {
        auction: {
          id: auction._id,
          auctionId: auction.auctionId,
          title: auction.title,
          status: auction.status,
          createdAt: auction.createdAt
        }
      }
    });
  })
);

// @route   POST /api/v1/auctions/:id/bids
// @desc    Place bid on auction
// @access  Private
router.post('/:auctionId/bids',
  [
    auth,
    biddingLimiter,
    param('auctionId').isString().withMessage('Invalid auction ID'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Bid amount must be greater than 0'),
    body('isAutoBid').optional().isBoolean(),
    body('maxAmount').optional().isFloat({ min: 0 }),
    body('increment').optional().isFloat({ min: 0 })
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const { amount, isAutoBid = false, maxAmount, increment } = req.body;
    const auctionId = req.params.auctionId;

    // Find auction
    const auction = await Auction.findOne({ auctionId });
    if (!auction) {
      throw new NotFoundError('Auction not found');
    }

    // Validate auction status
    if (auction.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Auction is not active',
        data: null
      });
    }

    // Check if auction has ended
    if (new Date() >= auction.timing.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Auction has ended',
        data: null
      });
    }

    // Check if user is not the seller
    if (auction.seller.userId.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot bid on your own auction',
        data: null
      });
    }

    // Validate bid amount
    const minBidAmount = auction.pricing.currentBid + (auction.bidding.bidIncrement || 1);
    if (amount < minBidAmount) {
      return res.status(400).json({
        success: false,
        message: `Bid must be at least ${minBidAmount} WKC`,
        data: null
      });
    }

    // Create bid
    const bid = new Bid({
      auction: {
        auctionId: auction.auctionId,
        auctionRef: auction._id
      },
      bidder: {
        userId: req.user.userId,
        anonymousId: req.user.anonymousId,
        walletAddress: req.user.walletAddress
      },
      amount,
      autoBid: {
        isAutoBid,
        maxAmount,
        increment,
        isActive: isAutoBid
      },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        bidSource: 'web'
      }
    });

    await bid.save();

    // Update auction with new highest bid
    await auction.placeBid(amount, {
      userId: req.user.userId,
      anonymousId: req.user.anonymousId,
      walletAddress: req.user.walletAddress
    });

    logger.auction('bid_placed', auction.auctionId, {
      bidId: bid.bidId,
      userId: req.user.userId,
      amount
    });

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: {
        bid: {
          id: bid._id,
          bidId: bid.bidId,
          amount: bid.amount,
          status: bid.status,
          placedAt: bid.timing.placedAt
        },
        auction: {
          currentBid: auction.pricing.currentBid,
          totalBids: auction.bidding.totalBids,
          endTime: auction.timing.endTime
        }
      }
    });
  })
);

// @route   GET /api/v1/auctions/:id/bids
// @desc    Get bids for auction
// @access  Public
router.get('/:auctionId/bids',
  [
    optionalAuth,
    param('auctionId').isString().withMessage('Invalid auction ID'),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;

    const auction = await Auction.findOne({ auctionId: req.params.auctionId });
    if (!auction) {
      throw new NotFoundError('Auction not found');
    }

    const bids = await Bid.find({ 'auction.auctionRef': auction._id })
      .sort({ amount: -1, 'timing.placedAt': -1 })
      .limit(parseInt(limit))
      .populate('bidder.userId', 'anonymousId')
      .select('-bidder.walletAddress -metadata');

    res.json({
      success: true,
      message: 'Auction bids retrieved successfully',
      data: {
        bids,
        total: bids.length
      }
    });
  })
);

// @route   POST /api/v1/auctions/:id/watch
// @desc    Watch/unwatch auction
// @access  Private
router.post('/:auctionId/watch',
  [
    auth,
    param('auctionId').isString().withMessage('Invalid auction ID')
  ],
  asyncHandler(async (req, res) => {
    const auction = await Auction.findOne({ auctionId: req.params.auctionId });
    if (!auction) {
      throw new NotFoundError('Auction not found');
    }

    await auction.addWatcher(req.user.userId);

    res.json({
      success: true,
      message: 'Auction added to watchlist',
      data: null
    });
  })
);

// @route   DELETE /api/v1/auctions/:id/watch
// @desc    Remove from watchlist
// @access  Private
router.delete('/:auctionId/watch',
  [
    auth,
    param('auctionId').isString().withMessage('Invalid auction ID')
  ],
  asyncHandler(async (req, res) => {
    const auction = await Auction.findOne({ auctionId: req.params.auctionId });
    if (!auction) {
      throw new NotFoundError('Auction not found');
    }

    await auction.removeWatcher(req.user.userId);

    res.json({
      success: true,
      message: 'Auction removed from watchlist',
      data: null
    });
  })
);

// @route   GET /api/v1/auctions/search
// @desc    Search auctions
// @access  Public
router.get('/search',
  [
    optionalAuth,
    query('q').isString().withMessage('Search query is required'),
    query('category').optional().isString(),
    query('price_min').optional().isFloat({ min: 0 }),
    query('price_max').optional().isFloat({ min: 0 }),
    query('type').optional().isIn(['forward', 'reverse'])
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const { q, category, price_min, price_max, type } = req.query;

    const query = {
      status: 'active',
      'moderation.isApproved': true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { 'specifications.brand': { $regex: q, $options: 'i' } },
        { 'specifications.model': { $regex: q, $options: 'i' } }
      ]
    };

    if (category) query.category = category;
    if (type) query.type = type;
    
    if (price_min || price_max) {
      query['pricing.currentBid'] = {};
      if (price_min) query['pricing.currentBid'].$gte = parseFloat(price_min);
      if (price_max) query['pricing.currentBid'].$lte = parseFloat(price_max);
    }

    const auctions = await Auction.find(query)
      .sort({ 'bidding.totalBids': -1, createdAt: -1 })
      .limit(50)
      .populate('seller.userId', 'anonymousId profile.reputation')
      .select('-seller.walletAddress -blockchain');

    res.json({
      success: true,
      message: 'Search results retrieved successfully',
      data: {
        auctions,
        query: q,
        total: auctions.length
      }
    });
  })
);

// @route   GET /api/v1/auctions/categories
// @desc    Get auction categories with counts
// @access  Public
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Auction.aggregate([
    { $match: { status: 'active', 'moderation.isApproved': true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const formattedCategories = categories.map(cat => ({
    name: cat._id,
    count: cat.count
  }));

  res.json({
    success: true,
    message: 'Categories retrieved successfully',
    data: {
      categories: formattedCategories
    }
  });
}));

// @route   GET /api/v1/auctions/featured
// @desc    Get featured auctions
// @access  Public
router.get('/featured', asyncHandler(async (req, res) => {
  const featuredAuctions = await Auction.find({
    status: 'active',
    'moderation.isApproved': true,
    'bidding.totalBids': { $gte: 5 },
    'analytics.views': { $gte: 50 }
  })
    .sort({ 'bidding.totalBids': -1, 'analytics.views': -1 })
    .limit(10)
    .populate('seller.userId', 'anonymousId profile.reputation')
    .select('-seller.walletAddress -blockchain');

  res.json({
    success: true,
    message: 'Featured auctions retrieved successfully',
    data: {
      auctions: featuredAuctions
    }
  });
}));

module.exports = router;