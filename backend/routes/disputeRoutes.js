// routes/disputeRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth, adminAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const disputeController = require('../controllers/disputeController');

const router = express.Router();

// Validators
const getDisputesValidators = [
  auth,
  query('status').optional().isIn(['open', 'investigating', 'resolved', 'closed']),
  query('category').optional().isIn(['item_not_as_described', 'item_not_received', 'damaged_item', 'late_delivery', 'other']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const getDisputeByIdValidators = [
  auth,
  param('disputeId').isString().withMessage('Invalid dispute ID')
];

const createDisputeValidators = [
  auth,
  body('escrowId').isString().withMessage('Escrow ID is required'),
  body('reason').isString().isLength({ min: 5, max: 100 }).withMessage('Reason must be between 5 and 100 characters'),
  body('description').isString().isLength({ min: 20, max: 2000 }).withMessage('Description must be between 20 and 2000 characters'),
  body('category').isIn(['item_not_as_described', 'item_not_received', 'damaged_item', 'late_delivery', 'other']).withMessage('Invalid category'),
  body('requestedResolution').optional().isIn(['full_refund', 'partial_refund', 'item_return', 'replacement', 'other']).withMessage('Invalid resolution type'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array')
];

const respondDisputeValidators = [
  auth,
  param('disputeId').isString().withMessage('Invalid dispute ID'),
  body('message').isString().isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array')
];

const resolveDisputeValidators = [
  adminAuth,
  param('disputeId').isString().withMessage('Invalid dispute ID'),
  body('decision').isIn(['buyer_favor', 'seller_favor', 'partial_refund', 'no_action']).withMessage('Invalid decision'),
  body('reasoning').isString().isLength({ min: 20, max: 1000 }).withMessage('Reasoning must be between 20 and 1000 characters'),
  body('refundPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Refund percentage must be between 0 and 100')
];

const assignDisputeValidators = [
  adminAuth,
  param('disputeId').isString().withMessage('Invalid dispute ID'),
  body('adminId').isMongoId().withMessage('Invalid admin ID'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
  body('estimatedResolutionDate').optional().isISO8601().withMessage('Invalid date format')
];

// ROUTES

// @desc    Get user disputes with filtering and pagination
// @route   GET /api/v1/disputes
// @access  Private
router.get(
  '/',
  getDisputesValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const result = await disputeController.getUserDisputes(
      req.query,
      req.user.userId,
      req.user.roles.includes('admin')
    );

    res.json({
      success: true,
      message: 'Disputes retrieved successfully',
      data: result
    });
  })
);

// @desc    Get specific dispute details
// @route   GET /api/v1/disputes/:disputeId
// @access  Private
router.get(
  '/:disputeId',
  getDisputeByIdValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const dispute = await disputeController.getDisputeById(
      req.params.disputeId,
      req.user.userId,
      req.user.roles.includes('admin')
    );

    res.json({
      success: true,
      message: 'Dispute details retrieved successfully',
      data: { dispute }
    });
  })
);

// @desc    Create a new dispute
// @route   POST /api/v1/disputes
// @access  Private
router.post(
  '/',
  createDisputeValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const dispute = await disputeController.createDispute(req.body, {
      userId: req.user.userId,
      anonymousId: req.user.anonymousId,
      role: req.user.role
    });

    res.status(201).json({
      success: true,
      message: 'Dispute created successfully',
      data: {
        dispute: {
          disputeId: dispute.disputeId,
          status: dispute.status,
          createdAt: dispute.createdAt
        }
      }
    });
  })
);

// @desc    Add response to dispute
// @route   POST /api/v1/disputes/:disputeId/respond
// @access  Private
router.post(
  '/:disputeId/respond',
  respondDisputeValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const dispute = await disputeController.addDisputeResponse(
      req.params.disputeId,
      req.body,
      {
        userId: req.user.userId,
        anonymousId: req.user.anonymousId
      }
    );

    res.json({
      success: true,
      message: 'Response added to dispute',
      data: {
        dispute: {
          disputeId: dispute.disputeId,
          status: dispute.status,
          lastResponse: new Date()
        }
      }
    });
  })
);

// @desc    Resolve dispute (admin only)
// @route   POST /api/v1/disputes/:disputeId/resolve
// @access  Private (Admin)
router.post(
  '/:disputeId/resolve',
  resolveDisputeValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const dispute = await disputeController.resolveDispute(
      req.params.disputeId,
      req.body,
      {
        userId: req.user.userId,
        anonymousId: req.user.anonymousId
      }
    );

    res.json({
      success: true,
      message: 'Dispute resolved successfully',
      data: {
        dispute: {
          disputeId: dispute.disputeId,
          status: dispute.status,
          decision: dispute.resolution.decision,
          resolvedAt: dispute.resolution.resolvedAt
        }
      }
    });
  })
);

// @desc    Assign dispute to admin
// @route   POST /api/v1/disputes/:disputeId/assign
// @access  Private (Admin)
router.post(
  '/:disputeId/assign',
  assignDisputeValidators,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const dispute = await disputeController.assignDispute(
      req.params.disputeId,
      {
        adminId: req.body.adminId,
        notes: req.body.notes,
        estimatedResolutionDate: req.body.estimatedResolutionDate
      }
    );

    res.json({
      success: true,
      message: 'Dispute assigned successfully',
      data: {
        dispute: {
          disputeId: dispute.disputeId,
          status: dispute.status,
          assignedTo: dispute.admin.assignedTo,
          assignedAt: dispute.admin.assignedAt
        }
      }
    });
  })
);

// @desc    Get dispute statistics
// @route   GET /api/v1/disputes/statistics
// @access  Private (Admin)
router.get(
  '/statistics',
  adminAuth,
  asyncHandler(async (req, res) => {
    const statistics = await disputeController.getDisputeStatistics();
    res.json({
      success: true,
      message: 'Dispute statistics retrieved successfully',
      data: statistics
    });
  })
);

module.exports = router;