// routes/bidRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth, optionalAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const bidController = require('../controllers/bidController');
const { biddingLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Validators
const placeBidValidators = [
  auth,
  param('id').isMongoId().withMessage('Invalid auction ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Bid amount must be greater than 0'),
  body('isAutoBid').optional().isBoolean().withMessage('isAutoBid must be a boolean'),
  body('maxAmount').optional().isFloat({ min: 0 }).withMessage('maxAmount must be a positive number'),
  body('increment').optional().isFloat({ min: 0 }).withMessage('increment must be a positive number')
];

const auctionBidsValidators = [
  optionalAuth,
  param('auctionId').isMongoId().withMessage('Invalid auction ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const userBidsValidators = [
  auth,
  query('status').optional().isIn(['pending', 'active', 'outbid', 'winning', 'won', 'lost', 'cancelled', 'refunded']),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const bidIdValidators = [
  auth,
  param('bidId').isMongoId().withMessage('Invalid bid ID')
];


const retractBidValidators = [
  param('bidId')
    .custom((value) => {
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isCustomBidId = /^BID_[A-Z0-9]{8}$/.test(value);

      if (!isMongoId && !isCustomBidId) {
        throw new Error('Invalid bid ID format. Must be a MongoDB ObjectId or a BID_xxxxxxxx code.');
      }
      return true;
    })
];


const suspiciousBidsValidators = [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// ROUTES

// @desc    Place a bid on an auction
// @route   POST /api/v1/bids/auction/:id
// @access  Private
router.post(
  '/auction/:id',
  auth,
  biddingLimiter,
  placeBidValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.placeBid(req, res);
  })
);

// @desc    Get all bids for an auction (anonymous)
// @route   GET /api/v1/bids/auction/:auctionId
// @access  Public
router.get(
  '/auction/:auctionId',
  optionalAuth,
  auctionBidsValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.getAuctionBids(req, res);
  })
);

// @desc    Get user's bid history
// @route   GET /api/v1/bids/user/my-bids
// @access  Private
router.get(
  '/user/my-bids',
  auth,
  userBidsValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.getUserBids(req, res);
  })
);

// @desc    Get highest bid for an auction
// @route   GET /api/v1/bids/auction/:auctionId/highest
// @access  Public
router.get(
  '/auction/:auctionId/highest',
  optionalAuth,
  param('auctionId').isMongoId().withMessage('Invalid auction ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.getHighestBid(req, res);
  })
);

// @desc    Get bid count for an auction
// @route   GET /api/v1/bids/auction/:auctionId/count
// @access  Public
router.get(
  '/auction/:auctionId/count',
  optionalAuth,
  param('auctionId').isMongoId().withMessage('Invalid auction ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.getBidCount(req, res);
  })
);

// @desc    Retract a bid (with penalty)
// @route   POST /api/v1/bids/:bidId/retract
// @access  Private
router.post(
  '/:bidId/retract',
  auth,
  retractBidValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.retractBid(req, res);
  })
);

// @desc    Delete a bid (admin/vendor - before auction starts)
// @route   DELETE /api/v1/bids/:bidId
// @access  Private (Admin/Vendor)
router.delete(
  '/:bidId',
  auth,
  bidIdValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.deleteBid(req, res);
  })
);

// @desc    Flag a bid for review (admin)
// @route   POST /api/v1/bids/:bidId/flag
// @access  Private (Admin)
router.post(
  '/:bidId/flag',
  auth,
  bidIdValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.flagBidReview(req, res);
  })
);

// @desc    Get suspicious bids for review (admin)
// @route   GET /api/v1/bids/suspicious
// @access  Private (Admin)
router.get(
  '/suspicious',
  auth,
  suspiciousBidsValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bidController.getSuspiciousBids(req, res);
  })
);

// @desc    Get bid status
// @route   GET /api/v1/bids/:bidId/status
// @access  Private
router.get(
  '/:bidId/status',
  auth,
  bidIdValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    
    // This endpoint is handled in the original code but not in the controller
    // We'll implement it here or add it to the controller
    const bid = await Bid.findOne({ _id: req.params.bidId })
      .populate('auction.auctionRef', 'title status timing.endTime pricing.currentBid');
    
    if (!bid) {
      return res.status(404).json({
        success: false,
        message: 'Bid not found',
        data: null
      });
    }

    if (bid.bidder.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - not bid owner',
        data: null
      });
    }

    res.json({
      success: true,
      message: 'Bid status retrieved successfully',
      data: {
        bid: {
          id: bid._id,
          amount: bid.amount,
          status: bid.status,
          placedAt: bid.timing.placedAt,
          auction: {
            title: bid.auction.auctionRef.title,
            status: bid.auction.auctionRef.status,
            currentBid: bid.auction.auctionRef.pricing.currentBid,
            endTime: bid.auction.auctionRef.timing.endTime
          },
          blockchain: {
            transactionHash: bid.blockchain.transactionHash,
            isOnChain: bid.blockchain.isOnChain
          }
        }
      }
    });
  })
);

module.exports = router;