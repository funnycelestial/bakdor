// routes/auctionRoutes.js
const mongoose = require('mongoose');
const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
const { biddingLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, validate } = require('../middleware/errorHandler');
const { uploadMultiple } = require('../middleware/upload');
const auctionController = require('../controllers/auctionController');
const { body, query, param } = require('express-validator');

const router = express.Router();

// ------------------
// Validators
// ------------------
const createAuctionValidator = [
  body('title')
    .isString()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .isString()
    .isLength({ min: 20, max: 2000 })
    .withMessage('Description must be between 20 and 2000 characters'),
  body('category')
    .isIn([
      'electronics',
      'fashion',
      'home-garden',
      'sports',
      'automotive',
      'books',
      'art',
      'collectibles',
      'services',
      'other'
    ])
    .withMessage('Invalid category'),
  body('type')
    .optional()
    .isIn(['forward', 'reverse'])
    .withMessage('Type must be "forward" or "reverse"'),
  body('startingBid')
    .isFloat({ min: 0.01 })
    .withMessage('Starting bid must be greater than 0'),
  body('reservePrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Reserve price must be >= 0'),
  body('buyNowPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Buy now price must be >= 0'),
  body('duration')
    .isInt({ min: 3600000 })
    .withMessage('Duration must be at least 1 hour in milliseconds'),
  body('condition')
    .isIn(['new', 'like-new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition'),
  body('brand').optional().isString(),
  body('model').optional().isString(),
  body('year').optional().isInt()
];

const paginationValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

const auctionIdValidator = [
  param("auctionId")
    .custom((value) => {
      const isObjectId = mongoose.isValidObjectId(value);
      const isAuctionCode = /^AUC_[A-F0-9]{8}$/i.test(value);

      if (!isObjectId && !isAuctionCode) {
        throw new Error("Invalid auction ID format. Must be a MongoDB ObjectId or an AUC_xxxxxxxx code.");
      }
      return true;
    }),
];

// ------------------
// Routes
// ------------------

// Create auction
router.post(
  '/create',
  auth,
  uploadMultiple('images', 10),
  createAuctionValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.createAuction(req.body, req.user.id);
    res.status(201).json(result);
  })
);

// ------------------
// STATIC routes first
// ------------------

// Current user's auctions
router.get(
  '/my',
  auth,
  paginationValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.getUserAuctions(req.user.id, req.query);
    res.json(result);
  })
);

// Seller's auctions (public)
router.get(
  '/seller/:sellerId',
  asyncHandler(async (req, res) => {
    const result = await auctionController.getSellerAuctions(req.params.sellerId);
    res.json(result);
  })
);

// Won auctions (private)
router.get(
  '/won',
  auth,
  asyncHandler(async (req, res) => {
    const result = await auctionController.getWonAuctions(req.user.id);
    res.json(result);
  })
);

// Watchlist
router.get(
  '/watchlist',
  auth,
  paginationValidator,
  validate,
  asyncHandler(async (req, res) => {
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const result = await auctionController.getWatchlist(req.user.id, page, limit);
    res.json(result);
  })
);

// Main auctions feed
router.get(
  '/',
  // Category filter
  query('category')
    .optional()
    .isIn([
      'electronics', 'fashion', 'home-garden', 'sports',
      'automotive', 'books', 'art', 'collectibles', 'services', 'other'
    ])
    .withMessage('Invalid category'),

  // Condition filter
  query('condition')
    .optional()
    .isIn(['new', 'like-new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition'),

  // Auction type filter
  query('type')
    .optional()
    .isIn(['forward', 'reverse'])
    .withMessage('Invalid auction type'),

  // Status filter
  query('status')
    .optional()
    .isIn(['active', 'pending', 'ended', 'all'])
    .withMessage('Invalid auction status'),

  // Time filter
  query('time')
    .optional()
    .isIn(['any', 'nextHour', 'next6h', 'next24h', 'next7d'])
    .withMessage('Invalid time filter'),

  // Special features
  query('specialFeature')
    .optional()
    .isIn(['reserve', 'buyNow'])
    .withMessage('Invalid special feature'),

  // Minimum bids
  query('minBids')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum bids must be a positive integer'),

  // Price range
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),

  // Sorting (case-insensitive)
  query('sortBy')
    .optional()
    .customSanitizer((val) => val.toLowerCase())
    .isIn([
      'newest', 'oldest', 'endingsoon',
      'pricelow', 'pricehigh',
      'mostbids', 'mostviews'
    ])
    .withMessage('Invalid sort option'),

  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),

  // Pagination
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  // Search
  query('search')
    .optional()
    .isString()
    .withMessage('Search term must be a string'),

  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.getActiveAuctions(req.query);
    res.json(result);
  })
);

// ------------------
// DYNAMIC routes last
// ------------------

// Get auction by ID
router.get(
  '/:auctionId',
  optionalAuth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const result = await auctionController.getAuctionById(req.params.auctionId, userId);
    res.json(result);
  })
);

// Update auction
router.put(
  '/:auctionId',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.updateAuction(
      req.params.auctionId,
      req.body,
      req.user.id
    );
    res.json(result);
  })
);

// Delete auction
router.delete(
  '/:auctionId',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.deleteAuction(req.params.auctionId, req.user.id);
    res.json(result);
  })
);

// Watch auction
router.post(
  '/:auctionId/watch',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.addWatcher(req.params.auctionId, req.user.id);
    res.json(result);
  })
);

router.delete(
  '/:auctionId/watch',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.removeWatcher(req.params.auctionId, req.user.id);
    res.json(result);
  })
);

// Close auction
router.post(
  '/:auctionId/close',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const forceClose = req.body.forceClose === 'true';
    const result = await auctionController.closeAuction(
      req.params.auctionId,
      req.user.id,
      forceClose
    );
    res.json(result);
  })
);

// Confirm receipt
router.post(
  '/:auctionId/receipt',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.confirmReceipt(req.params.auctionId, req.user.id);
    res.json(result);
  })
);

// Update delivery info
router.put(
  '/:auctionId/delivery',
  auth,
  auctionIdValidator,
  validate,
  asyncHandler(async (req, res) => {
    const result = await auctionController.updateDeliveryInfo(
      req.params.auctionId,
      req.body,
      req.user.id
    );
    res.json(result);
  })
);

module.exports = router;
