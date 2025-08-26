const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Bid = require('../models/bidModel');
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { auth, optionalAuth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const web3Service = require('../services/web3Service');
const { socketService } = require('../services/socketService');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/v1/bids/my-bids
// @desc    Get user's bid history
// @access  Private
router.get('/my-bids', [
  auth,
  query('status').optional().isIn(['pending', 'active', 'outbid', 'winning', 'won', 'lost', 'cancelled', 'refunded']),
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

  const { status, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { 'bidder.userId': req.user.userId };
  if (status) query.status = status;

  const [bids, total] = await Promise.all([
    Bid.find(query)
      .populate('auction.auctionRef', 'title status timing.endTime pricing.currentBid')
      .sort({ 'timing.placedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Bid.countDocuments(query)
  ]);

  logger.api('/bids/my-bids', 'GET', 200, { 
    userId: req.user.userId,
    resultCount: bids.length 
  });

  res.json({
    success: true,
    message: 'Bid history retrieved successfully',
    data: {
      bids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));


// @route   DELETE /api/v1/bids/:id
// @desc    Withdraw bid (if allowed)
// @access  Private
router.delete('/:bidId', [
  auth,
  param('bidId').isString().withMessage('Invalid bid ID')
], asyncHandler(async (req, res) => {
  const bid = await Bid.findOne({ bidId: req.params.bidId });
  
  if (!bid) {
    throw new NotFoundError('Bid not found');
  }

  // Check ownership
  if (bid.bidder.userId.toString() !== req.user.userId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - not bid owner',
      data: null
    });
  }

  // Check if bid can be withdrawn
  if (bid.status !== 'active' && bid.status !== 'outbid') {
    return res.status(400).json({
      success: false,
      message: 'Cannot withdraw this bid',
      data: null
    });
  }

  // Get auction to check timing
  const auction = await Auction.findById(bid.auction.auctionRef);
  const timeRemaining = auction.timing.endTime - new Date();
  
  // Don't allow withdrawal in last 5 minutes
  if (timeRemaining < 5 * 60 * 1000) {
    return res.status(400).json({
      success: false,
      message: 'Cannot withdraw bid in the last 5 minutes',
      data: null
    });
  }

  try {
    // Unlock tokens on blockchain
    const unlockResult = await web3Service.transferTokens(
      req.user.walletAddress,
      bid.amount
    );

    // Update bid status
    bid.status = 'cancelled';
    bid.timing.refundedAt = new Date();
    bid.refund.isRefunded = true;
    bid.refund.refundAmount = bid.amount;
    bid.refund.refundTransactionHash = unlockResult.transactionHash;
    bid.refund.refundReason = 'User withdrawal';
    await bid.save();

    // Create refund transaction record
    const refundTransaction = new TokenTransaction({
      type: 'bid_unlock',
      user: {
        userId: req.user.userId,
        walletAddress: req.user.walletAddress,
        anonymousId: req.user.anonymousId
      },
      amount: bid.amount,
      blockchain: {
        transactionHash: unlockResult.transactionHash,
        blockNumber: unlockResult.blockNumber,
        gasUsed: unlockResult.gasUsed,
        isConfirmed: true
      },
      relatedTo: {
        type: 'bid',
        id: bid.bidId,
        reference: bid._id
      },
      status: 'confirmed'
    });

    await refundTransaction.save();

    logger.auction('bid_withdrawn', auction.auctionId, {
      bidId: bid.bidId,
      userId: req.user.userId,
      amount: bid.amount
    });

    res.json({
      success: true,
      message: 'Bid withdrawn successfully',
      data: {
        refundAmount: bid.amount,
        transactionHash: unlockResult.transactionHash
      }
    });

  } catch (blockchainError) {
    logger.error('Blockchain bid withdrawal failed:', blockchainError);
    
    res.status(400).json({
      success: false,
      message: 'Failed to unlock tokens on blockchain',
      data: null
    });
  }
}));

// @route   GET /api/v1/bids/:id/status
// @desc    Check bid status
// @access  Private
router.get('/:bidId/status', [
  auth,
  param('bidId').isString().withMessage('Invalid bid ID')
], asyncHandler(async (req, res) => {
  const bid = await Bid.findOne({ bidId: req.params.bidId })
    .populate('auction.auctionRef', 'title status timing.endTime pricing.currentBid');
  
  if (!bid) {
    throw new NotFoundError('Bid not found');
  }

  // Check ownership
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
        bidId: bid.bidId,
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
}));

module.exports = router;