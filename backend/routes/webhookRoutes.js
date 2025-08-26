const express = require('express');
const mobileMoneyController = require('../controllers/mobileMoneyController');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// @route   POST /api/v1/webhooks/mobile-money/:provider
// @desc    Handle mobile money payment webhooks
// @access  Public (but verified)
router.post('/mobile-money/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const signature = req.get('X-Signature') || req.get('Authorization');
  
  logger.info(`Received webhook from ${provider}`, {
    headers: req.headers,
    body: req.body
  });

  try {
    const result = await mobileMoneyController.handleWebhook(
      provider,
      req.body,
      signature
    );

    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error(`Webhook processing failed for ${provider}:`, error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
}));

// @route   POST /api/v1/webhooks/blockchain
// @desc    Handle blockchain event webhooks (if using external service)
// @access  Public (but verified)
router.post('/blockchain', asyncHandler(async (req, res) => {
  const { event, data } = req.body;
  
  logger.blockchain('webhook_received', {
    event,
    data
  });

  // Process blockchain events
  try {
    switch (event) {
      case 'auction_created':
        // Handle auction creation confirmation
        break;
      case 'bid_placed':
        // Handle bid placement confirmation
        break;
      case 'tokens_burned':
        // Handle token burn confirmation
        break;
      default:
        logger.warn(`Unknown blockchain event: ${event}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Blockchain webhook processing failed:', error);
    res.status(500).json({ success: false });
  }
}));

// @route   GET /api/v1/webhooks/test/:provider
// @desc    Test webhook endpoint
// @access  Admin
router.get('/test/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  
  // Simulate webhook payload for testing
  const testPayload = {
    mtn_momo: {
      financialTransactionId: 'TEST_MTN_123',
      status: 'SUCCESSFUL',
      amount: '100.00',
      currency: 'GHS'
    },
    vodafone_cash: {
      transaction_id: 'TEST_VOD_456',
      transaction_status: 'COMPLETED',
      amount: '100.00'
    },
    airteltigo: {
      txnid: 'TEST_ATG_789',
      status: 'SUCCESS',
      amount: '100.00'
    },
    telecel_cash: {
      transactionId: 'TEST_TEL_012',
      status: 'COMPLETED',
      amount: '100.00'
    }
  };

  const payload = testPayload[provider];
  if (!payload) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider for testing'
    });
  }

  try {
    const result = await mobileMoneyController.handleWebhook(
      provider,
      payload,
      'test_signature'
    );

    res.json({
      success: true,
      message: 'Test webhook processed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Test webhook failed',
      error: error.message
    });
  }
}));

module.exports = router;