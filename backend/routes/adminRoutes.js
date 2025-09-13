// routes/adminRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { adminAuth, moderatorAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const { 
  getPendingApprovals, 
  approveAuction, 
  rejectAuction, 
  getApprovalQueue, 
  autoApproveLowRisk,
  bulkApproveAuctions,
  getApprovalStats
} = require('../controllers/adminApprovalController');

const router = express.Router();

// VALIDATORS

// Pending approvals validators
const pendingApprovalsValidators = [
  moderatorAuth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('type').optional().isIn(['forward', 'reverse']).withMessage('Type must be "forward" or "reverse"')
];

// Approve auction validators
const approveAuctionValidators = [
  moderatorAuth,
  param('id').isMongoId().withMessage('Invalid auction ID'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

// Reject auction validators
const rejectAuctionValidators = [
  moderatorAuth,
  param('id').isMongoId().withMessage('Invalid auction ID'),
  body('reason')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters')
];

// Bulk approve validators
const bulkApproveValidators = [
  adminAuth,
  body('auctionIds').isArray().withMessage('Auction IDs must be an array'),
  body('auctionIds.*').isMongoId().withMessage('Invalid auction ID'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

// Auto approve validators
const autoApproveValidators = [
  adminAuth,
  body('dryRun').optional().isBoolean().withMessage('Dry run must be a boolean')
];

// Approval stats validators
const approvalStatsValidators = [
  adminAuth,
  query('period').optional().isIn(['24h', '7d', '30d']).withMessage('Period must be one of: 24h, 7d, 30d')
];

// ROUTES

// @desc    Get all pending auction approvals with risk assessment
// @route   GET /api/v1/admin/pending-approvals
// @access  Admin/Moderator
router.get(
  '/pending-approvals',
  pendingApprovalsValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await getPendingApprovals(req, res);
  })
);

// @desc    Get approval queue with priority sorting
// @route   GET /api/v1/admin/approval-queue
// @access  Admin/Moderator
router.get(
  '/approval-queue',
  moderatorAuth,
  asyncHandler(async (req, res) => {
    await getApprovalQueue(req, res);
  })
);

// @desc    Approve a single auction
// @route   POST /api/v1/admin/approve-auction/:id
// @access  Admin/Moderator
router.post(
  '/approve-auction/:id',
  approveAuctionValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await approveAuction(req, res);
  })
);

// @desc    Reject a single auction
// @route   POST /api/v1/admin/reject-auction/:id
// @access  Admin/Moderator
router.post(
  '/reject-auction/:id',
  rejectAuctionValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await rejectAuction(req, res);
  })
);

// @desc    Bulk approve multiple auctions
// @route   POST /api/v1/admin/bulk-approve
// @access  Admin
router.post(
  '/bulk-approve',
  bulkApproveValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await bulkApproveAuctions(req, res);
  })
);

// @desc    Auto-approve low-risk auctions
// @route   POST /api/v1/admin/auto-approve
// @access  Admin
router.post(
  '/auto-approve',
  autoApproveValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await autoApproveLowRisk(req, res);
  })
);

// @desc    Get approval statistics
// @route   GET /api/v1/admin/approval-stats
// @access  Admin
router.get(
  '/approval-stats',
  approvalStatsValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }
    await getApprovalStats(req, res);
  })
);

module.exports = router;