const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const walletController = require('../controllers/walletController');
const router = express.Router();

// @route   GET /api/v1/wallet/balance
// @desc    Get user token balance from blockchain
// @access  Private
router.get('/balance', auth, asyncHandler(async (req, res) => {
  try {
    const balanceData = await walletController.getWalletBalance(
      req.user.walletAddress,
      req.user.userId
    );
    
    res.json({
      success: true,
      message: 'Balance retrieved successfully',
      data: balanceData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   GET /api/v1/wallet/transactions
// @desc    Get transaction history
// @access  Private
router.get('/transactions', [
  auth,
  query('type').optional().isIn(['deposit', 'withdrawal', 'bid_lock', 'bid_unlock', 'escrow_lock', 'escrow_release', 'fee_payment', 'transfer', 'refund']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  
  try {
    const transactionData = await walletController.getTransactionHistory(
      req.user.userId,
      req.query
    );
    
    res.json({
      success: true,
      message: 'Transaction history retrieved successfully',
      data: transactionData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   POST /api/v1/wallet/deposit
// @desc    Deposit tokens via MetaMask
// @access  Private
router.post('/deposit', [
  auth,
  body('amount').isFloat({ min: 1 }).withMessage('Deposit amount must be at least 1 token'),
  body('transactionHash').isString().withMessage('Transaction hash is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  
  try {
    const result = await walletController.processDeposit(
      req.body,
      {
        walletAddress: req.user.walletAddress,
        userId: req.user.userId,
        anonymousId: req.user.anonymousId
      },
      {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    );
    
    res.json({
      success: true,
      message: 'Deposit confirmed successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   POST /api/v1/wallet/withdraw
// @desc    Withdraw tokens to external wallet
// @access  Private
router.post('/withdraw', [
  auth,
  body('amount').isFloat({ min: 1 }).withMessage('Withdrawal amount must be at least 1 token'),
  body('recipientAddress').isLength({ min: 42, max: 42 }).withMessage('Invalid recipient wallet address')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  
  try {
    const result = await walletController.processWithdrawal(
      req.body,
      {
        walletAddress: req.user.walletAddress,
        userId: req.user.userId,
        anonymousId: req.user.anonymousId
      },
      {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    );
    
    res.json({
      success: true,
      message: 'Withdrawal completed successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   POST /api/v1/wallet/transfer
// @desc    Transfer tokens to another user on platform
// @access  Private
router.post('/transfer', [
  auth,
  body('recipientAddress').isLength({ min: 42, max: 42 }).withMessage('Invalid recipient wallet address'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Transfer amount must be greater than 0'),
  body('note').optional().isString().isLength({ max: 200 }).withMessage('Note too long')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  
  try {
    const result = await walletController.processTransfer(
      req.body,
      {
        walletAddress: req.user.walletAddress,
        userId: req.user.userId,
        anonymousId: req.user.anonymousId
      },
      {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    );
    
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   GET /api/v1/wallet/payment-methods
// @desc    Get available payment methods (MetaMask only)
// @access  Private
router.get('/payment-methods', auth, asyncHandler(async (req, res) => {
  try {
    const paymentMethods = walletController.getPaymentMethods();
    
    res.json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: paymentMethods
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

// @route   GET /api/v1/wallet/estimate-fees
// @desc    Estimate transaction fees
// @access  Private
router.get('/estimate-fees', [
  auth,
  query('type').isIn(['transfer', 'withdrawal']).withMessage('Invalid transaction type'),
  query('amount').isFloat({ min: 0 }).withMessage('Amount is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  
  try {
    const feeEstimate = await walletController.estimateFees(
      req.query.type,
      parseFloat(req.query.amount)
    );
    
    res.json({
      success: true,
      message: 'Fee estimate retrieved successfully',
      data: feeEstimate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
}));

module.exports = router;