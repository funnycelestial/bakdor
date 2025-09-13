const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const webhookController = require('../controllers/webhookController');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const router = express.Router();

// @route   POST /api/v1/webhooks/transaction
// @desc    Handle blockchain transaction confirmation webhooks
// @access  Public (with signature verification)
router.post('/transaction', asyncHandler(async (req, res) => {
  const signature = req.get('X-Webhook-Signature') || req.get('X-Signature');
  
  logger.blockchain('webhook_received', {
    type: 'transaction',
    headers: req.headers,
    body: req.body
  });
  
  try {
    const result = await webhookController.handleTransactionConfirmation(
      req.body,
      signature
    );
    
    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    logger.error('Transaction webhook processing failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
}));

// @route   POST /api/v1/webhooks/auction
// @desc    Handle auction event webhooks
// @access  Public (with signature verification)
router.post('/auction', asyncHandler(async (req, res) => {
  const signature = req.get('X-Webhook-Signature') || req.get('X-Signature');
  
  logger.blockchain('webhook_received', {
    type: 'auction',
    headers: req.headers,
    body: req.body
  });
  
  try {
    const result = await webhookController.handleAuctionEvent(
      req.body,
      signature
    );
    
    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    logger.error('Auction webhook processing failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
}));

// @route   POST /api/v1/webhooks/token
// @desc    Handle token event webhooks
// @access  Public (with signature verification)
router.post('/token', asyncHandler(async (req, res) => {
  const signature = req.get('X-Webhook-Signature') || req.get('X-Signature');
  
  logger.blockchain('webhook_received', {
    type: 'token',
    headers: req.headers,
    body: req.body
  });
  
  try {
    const result = await webhookController.handleTokenEvent(
      req.body,
      signature
    );
    
    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    logger.error('Token webhook processing failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
}));

// @route   POST /api/v1/webhooks/test
// @desc    Test webhook endpoint
// @access  Public
router.post('/test', asyncHandler(async (req, res) => {
  logger.info('Test webhook received', {
    headers: req.headers,
    body: req.body
  });
  
  // Echo back the request for testing
  res.json({
    success: true,
    message: 'Test webhook received',
    timestamp: new Date(),
    headers: req.headers,
    body: req.body
  });
}));

// @route   GET /api/v1/webhooks/test
// @desc    Test webhook endpoint (GET)
// @access  Public
router.get('/test', asyncHandler(async (req, res) => {
  logger.info('Test webhook GET received', {
    headers: req.headers,
    query: req.query
  });
  
  res.json({
    success: true,
    message: 'Test webhook endpoint is working',
    timestamp: new Date()
  });
}));

module.exports = router;