// routes/escrowRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const escrowController = require('../controllers/escrowController');

const router = express.Router();

// Validators
const validateGetTransactions = [
  auth,
  query('status').optional().isIn(['created', 'funded', 'delivered', 'confirmed', 'released', 'disputed', 'resolved']),
  query('role').optional().isIn(['buyer', 'seller']),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

const validateGetEscrowById = [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID')
];

const validateConfirmDelivery = [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('feedback').optional().isString().isLength({ max: 500 }).withMessage('Feedback must be less than 500 characters')
];

const validateMarkDelivered = [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('trackingNumber').optional().isString().withMessage('Tracking number must be a string'),
  body('carrier').optional().isString().withMessage('Carrier must be a string'),
  body('deliveryNotes').optional().isString().isLength({ max: 500 }).withMessage('Delivery notes must be less than 500 characters')
];

const validateInitiateDispute = [
  auth,
  param('escrowId').isString().withMessage('Invalid escrow ID'),
  body('reason').isString().isLength({ min: 10, max: 1000 }).withMessage('Reason must be between 10 and 1000 characters'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array'),
  body('requestedResolution').optional().isString().isLength({ max: 500 }).withMessage('Requested resolution must be less than 500 characters')
];

// ROUTES

// @desc    Get user's escrow transactions with filtering and pagination
// @route   GET /api/v1/escrow/transactions
// @access  Private
router.get(
  '/transactions',
  validateGetTransactions,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const result = await escrowController.getUserEscrows(req.query, req.user.userId);

    res.json({
      success: true,
      message: 'Escrow transactions retrieved successfully',
      data: result
    });
  })
);

// @desc    Get specific escrow details with permission checks
// @route   GET /api/v1/escrow/:escrowId
// @access  Private
router.get(
  '/:escrowId',
  validateGetEscrowById,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const escrow = await escrowController.getEscrowById(req.params.escrowId, req.user.userId);

    res.json({
      success: true,
      message: 'Escrow details retrieved successfully',
      data: { escrow }
    });
  })
);

// @desc    Confirm delivery and release payment (buyer action)
// @route   POST /api/v1/escrow/:escrowId/confirm-delivery
// @access  Private
router.post(
  '/:escrowId/confirm-delivery',
  validateConfirmDelivery,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const result = await escrowController.confirmDelivery(
      req.params.escrowId,
      req.user.userId,
      req.body
    );

    res.json({
      success: true,
      message: 'Delivery confirmed and payment released',
      data: result
    });
  })
);

// @desc    Mark item as delivered (seller action)
// @route   POST /api/v1/escrow/:escrowId/mark-delivered
// @access  Private
router.post(
  '/:escrowId/mark-delivered',
  validateMarkDelivered,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const result = await escrowController.markDelivered(
      req.params.escrowId,
      req.user.userId,
      req.body
    );

    res.json({
      success: true,
      message: 'Item marked as delivered',
      data: result
    });
  })
);

// @desc    Initiate a dispute for an escrow
// @route   POST /api/v1/escrow/:escrowId/dispute
// @access  Private
router.post(
  '/:escrowId/dispute',
  validateInitiateDispute,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: formatValidationErrors(errors)
      });
    }

    const result = await escrowController.initiateDispute(
      req.params.escrowId,
      req.user.userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Dispute filed successfully',
      data: result
    });
  })
);

module.exports = router;