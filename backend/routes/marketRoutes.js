// routes/marketRoutes.js
const express = require('express');
const { query, validationResult } = require('express-validator');
const { optionalAuth, auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const marketController = require('../controllers/marketController');

const router = express.Router();

// Validation middlewares
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const validateTrending = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const validateEndingSoon = [
  query('hours')
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage('Hours must be between 1 and 24'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const validateFeatured = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20')
];

const validateMarketFilters = [
  query('category')
    .optional()
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
      'other',
      'all'
    ])
    .withMessage('Invalid category'),
  query('type')
    .optional()
    .isIn(['forward', 'reverse', 'all'])
    .withMessage('Type must be "forward", "reverse", or "all"'),
  query('status')
    .optional()
    .isIn(['active', 'pending', 'ended', 'cancelled', 'all'])
    .withMessage('Invalid status'),
  query('timeFilter')
    .optional()
    .isIn(['next_hour', 'next_6h', 'next_24h', 'next_7d', 'any'])
    .withMessage('Invalid time filter'),
  query('condition')
    .optional()
    .isIn(['new', 'like-new', 'good', 'fair', 'poor', 'any'])
    .withMessage('Invalid condition'),
  query('price_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('price_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  query('minBids')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum bids must be a non-negative integer'),
  query('hasBuyNow')
    .optional()
    .isBoolean()
    .withMessage('hasBuyNow must be a boolean'),
  query('hasReserve')
    .optional()
    .isBoolean()
    .withMessage('hasReserve must be a boolean'),
  query('sort')
    .optional()
    .isIn(['newest', 'oldest', 'ending_soon', 'price_low', 'price_high', 'most_bids'])
    .withMessage('Invalid sort option'),
  ...validatePagination
];

const validateSearch = [
  query('q')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Search query must be a string with max 200 characters'),
  query('category')
    .optional()
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
      'other',
      'all'
    ])
    .withMessage('Invalid category'),
  query('type')
    .optional()
    .isIn(['forward', 'reverse', 'all'])
    .withMessage('Type must be "forward", "reverse", or "all"'),
  query('condition')
    .optional()
    .isIn(['new', 'like-new', 'good', 'fair', 'poor', 'any'])
    .withMessage('Invalid condition'),
  query('price_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('price_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  query('minBids')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum bids must be a non-negative integer'),
  query('hasBuyNow')
    .optional()
    .isBoolean()
    .withMessage('hasBuyNow must be a boolean'),
  query('hasReserve')
    .optional()
    .isBoolean()
    .withMessage('hasReserve must be a boolean'),
  query('sort')
    .optional()
    .isIn(['relevance', 'newest', 'ending_soon', 'price_low', 'price_high', 'most_bids'])
    .withMessage('Invalid sort option'),
  ...validatePagination
];

const validateLiveAuctions = [
  query('sort')
    .optional()
    .isIn(['newest', 'ending_soon', 'price_low', 'price_high', 'most_bids'])
    .withMessage('Invalid sort option'),
  ...validatePagination
];

const validateReverseAuctions = [
  query('sort')
    .optional()
    .isIn(['newest', 'ending_soon', 'price_low', 'price_high', 'most_bids'])
    .withMessage('Invalid sort option'),
  ...validatePagination
];

// ROUTES

// @desc    Get live auctions
// @route   GET /api/v1/market/live
// @access  Public
router.get(
  '/live',
  optionalAuth,
  validateLiveAuctions,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const liveData = await marketController.getLiveAuctions(req.query);
      res.json({
        success: true,
        message: 'Live auctions retrieved successfully',
        data: liveData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve live auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get filtered auctions
// @route   GET /api/v1/market/filtered
// @access  Public
router.get(
  '/filtered',
  optionalAuth,
  validateMarketFilters,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      // Pass user role for moderator access
      const filters = {
        ...req.query,
        userRole: req.user?.roles
      };
      const filteredData = await marketController.getFilteredAuctions(filters);
      res.json({
        success: true,
        message: 'Filtered auctions retrieved successfully',
        data: filteredData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve filtered auctions',
        error: error.message
      });
    }
  })
);

// @desc    Search auctions
// @route   GET /api/v1/market/search
// @access  Public
router.get(
  '/search',
  optionalAuth,
  validateSearch,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const searchData = await marketController.searchAuctions(req.query, req.user?._id);
      res.json({
        success: true,
        message: 'Search results retrieved successfully',
        data: searchData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to search auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get auctions ending soon
// @route   GET /api/v1/market/ending-soon
// @access  Public
router.get(
  '/ending-soon',
  validateEndingSoon,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const { hours = 1, limit = 20 } = req.query;
      const endingSoonData = await marketController.getEndingSoonAuctions(
        parseInt(hours, 10),
        parseInt(limit, 10)
      );
      res.json({
        success: true,
        message: 'Ending soon auctions retrieved successfully',
        data: endingSoonData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve ending soon auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get trending auctions
// @route   GET /api/v1/market/trending
// @access  Public
router.get(
  '/trending',
  validateTrending,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const { limit = 20 } = req.query;
      const trendingData = await marketController.getTrendingAuctions(parseInt(limit, 10));
      res.json({
        success: true,
        message: 'Trending auctions retrieved successfully',
        data: trendingData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve trending auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get featured auctions
// @route   GET /api/v1/market/featured
// @access  Public
router.get(
  '/featured',
  validateFeatured,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const { limit = 10 } = req.query;
      const featuredData = await marketController.getFeaturedAuctions(parseInt(limit, 10));
      res.json({
        success: true,
        message: 'Featured auctions retrieved successfully',
        data: featuredData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve featured auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get reverse auctions
// @route   GET /api/v1/market/reverse
// @access  Public
router.get(
  '/reverse',
  optionalAuth,
  validateReverseAuctions,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    try {
      const reverseData = await marketController.getReverseAuctions(req.query);
      res.json({
        success: true,
        message: 'Reverse auctions retrieved successfully',
        data: reverseData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reverse auctions',
        error: error.message
      });
    }
  })
);

// @desc    Get auction categories
// @route   GET /api/v1/market/categories
// @access  Public
router.get(
  '/categories',
  optionalAuth,
  asyncHandler(async (req, res) => {
    try {
      const categoryData = await marketController.getCategories();
      res.json({
        success: true,
        message: 'Categories retrieved successfully',
        data: categoryData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve categories',
        error: error.message
      });
    }
  })
);

module.exports = router;