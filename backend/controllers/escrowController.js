const Escrow = require('../models/escrowModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Get user's escrow transactions with filtering and pagination
 * @param {Object} filters - Filter options including status, role, page, limit
 * @param {string} userId - Current user's ID
 * @returns {Object} - Escrows and pagination info
 */
const getUserEscrows = async (filters, userId) => {
  const { status, role, page = 1, limit = 20 } = filters;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Build query based on user role
  let query = {};
  if (role === 'buyer') {
    query['buyer.userId'] = userId;
  } else if (role === 'seller') {
    query['seller.userId'] = userId;
  } else {
    query.$or = [
      { 'buyer.userId': userId },
      { 'seller.userId': userId }
    ];
  }
  
  if (status) query.status = status;
  
  const [escrows, total] = await Promise.all([
    Escrow.find(query)
      .populate('auction.auctionRef', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Escrow.countDocuments(query)
  ]);
  
  return {
    escrows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

/**
 * Get specific escrow details with permission checks
 * @param {string} escrowId - Escrow ID
 * @param {string} userId - Current user's ID
 * @returns {Object} - Escrow details
 */
const getEscrowById = async (escrowId, userId) => {
  const escrow = await Escrow.findOne({ escrowId })
    .populate('auction.auctionRef', 'title description')
    .populate('buyer.userId', 'anonymousId profile.reputation')
    .populate('seller.userId', 'anonymousId profile.reputation');
  
  if (!escrow) {
    throw new Error('Escrow not found');
  }
  
  // Check if user is involved in this escrow
  const isInvolved = escrow.buyer.userId.toString() === userId || 
                   escrow.seller.userId.toString() === userId;
  
  if (!isInvolved) {
    throw new Error('Access denied - not involved in this escrow');
  }
  
  return escrow;
};

/**
 * Confirm delivery and release payment (buyer action)
 * @param {string} escrowId - Escrow ID
 * @param {string} userId - Current user's ID
 * @param {Object} confirmationData - Confirmation data including rating and feedback
 * @returns {Object} - Updated escrow information
 */
const confirmDelivery = async (escrowId, userId, confirmationData) => {
  const { rating, feedback } = confirmationData;
  
  const escrow = await Escrow.findOne({ escrowId });
  if (!escrow) {
    throw new Error('Escrow not found');
  }
  
  // Check if user is the buyer
  if (escrow.buyer.userId.toString() !== userId) {
    throw new Error('Only the buyer can confirm delivery');
  }
  
  // Check escrow status
  if (escrow.status !== 'delivered') {
    throw new Error('Escrow must be in delivered status to confirm');
  }
  
  try {
    // Release escrow on blockchain
    const releaseResult = await web3Service.releaseEscrowOnChain(escrow.escrowId);
    
    // Update escrow status
    escrow.status = 'released';
    escrow.delivery.confirmedBy = escrow.buyer.anonymousId;
    escrow.delivery.deliveredAt = new Date();
    escrow.blockchain.transactionHash = releaseResult.transactionHash;
    escrow.blockchain.blockNumber = releaseResult.blockNumber;
    await escrow.save();
    
    // Create token transaction for escrow release
    const releaseTransaction = new TokenTransaction({
      type: 'escrow_release',
      user: {
        userId: escrow.seller.userId,
        walletAddress: escrow.seller.walletAddress,
        anonymousId: escrow.seller.anonymousId
      },
      amount: escrow.amount,
      blockchain: {
        transactionHash: releaseResult.transactionHash,
        blockNumber: releaseResult.blockNumber,
        gasUsed: releaseResult.gasUsed,
        isConfirmed: true
      },
      relatedTo: {
        type: 'escrow',
        id: escrow.escrowId,
        reference: escrow._id
      },
      status: 'confirmed'
    });
    await releaseTransaction.save();
    
    // Update seller reputation if rating provided
    if (rating) {
      const seller = await User.findById(escrow.seller.userId);
      await seller.updateReputation(rating);
    }
    
    // Create notifications
    const notifications = [
      new Notification({
        recipient: {
          userId: escrow.seller.userId,
          anonymousId: escrow.seller.anonymousId
        },
        type: 'escrow_released',
        priority: 'high',
        title: 'Payment Released',
        message: `Buyer confirmed delivery. ${escrow.amount} WKC has been released to your wallet.`,
        data: {
          escrowId: escrow.escrowId,
          amount: escrow.amount,
          currency: 'WKC'
        },
        channels: {
          inApp: { enabled: true },
          email: { enabled: true }
        }
      }),
      new Notification({
        recipient: {
          userId: escrow.buyer.userId,
          anonymousId: escrow.buyer.anonymousId
        },
        type: 'delivery_confirmed',
        priority: 'medium',
        title: 'Delivery Confirmed',
        message: 'You have successfully confirmed delivery. Transaction completed.',
        data: {
          escrowId: escrow.escrowId,
          amount: escrow.amount
        },
        channels: {
          inApp: { enabled: true }
        }
      })
    ];
    await Promise.all(notifications.map(n => n.save()));
    
    logger.escrow('delivery_confirmed', escrow.escrowId, {
      buyerId: userId,
      sellerId: escrow.seller.userId,
      amount: escrow.amount,
      rating
    });
    
    return {
      escrow: {
        escrowId: escrow.escrowId,
        status: escrow.status,
        amount: escrow.amount,
        releasedAt: escrow.delivery.deliveredAt,
        transactionHash: releaseResult.transactionHash
      }
    };
  } catch (blockchainError) {
    logger.error('Escrow release failed:', blockchainError);
    throw new Error('Failed to release escrow on blockchain');
  }
};

/**
 * Mark item as delivered (seller action)
 * @param {string} escrowId - Escrow ID
 * @param {string} userId - Current user's ID
 * @param {Object} deliveryData - Delivery data including tracking info
 * @returns {Object} - Updated escrow information
 */
const markDelivered = async (escrowId, userId, deliveryData) => {
  const { trackingNumber, carrier, deliveryNotes } = deliveryData;
  
  const escrow = await Escrow.findOne({ escrowId });
  if (!escrow) {
    throw new Error('Escrow not found');
  }
  
  // Check if user is the seller
  if (escrow.seller.userId.toString() !== userId) {
    throw new Error('Only the seller can mark as delivered');
  }
  
  // Check escrow status
  if (escrow.status !== 'funded') {
    throw new Error('Escrow must be funded to mark as delivered');
  }
  
  // Update escrow
  escrow.status = 'delivered';
  escrow.delivery.trackingNumber = trackingNumber;
  escrow.delivery.carrier = carrier;
  escrow.delivery.deliveredAt = new Date();
  await escrow.save();
  
  // Create notification for buyer
  const notification = new Notification({
    recipient: {
      userId: escrow.buyer.userId,
      anonymousId: escrow.buyer.anonymousId
    },
    type: 'delivery_confirmed',
    priority: 'high',
    title: 'Item Delivered',
    message: `Seller marked your item as delivered. Please confirm receipt to release payment.`,
    data: {
      escrowId: escrow.escrowId,
      trackingNumber,
      carrier,
      deliveryNotes
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });
  await notification.save();
  
  logger.escrow('marked_delivered', escrow.escrowId, {
    sellerId: userId,
    buyerId: escrow.buyer.userId,
    trackingNumber
  });
  
  return {
    escrow: {
      escrowId: escrow.escrowId,
      status: escrow.status,
      delivery: escrow.delivery
    }
  };
};

/**
 * Initiate a dispute for an escrow
 * @param {string} escrowId - Escrow ID
 * @param {string} userId - Current user's ID
 * @param {Object} disputeData - Dispute data including reason and evidence
 * @returns {Object} - Dispute information
 */
const initiateDispute = async (escrowId, userId, disputeData) => {
  const { reason, evidence = [], requestedResolution } = disputeData;
  
  const escrow = await Escrow.findOne({ escrowId });
  if (!escrow) {
    throw new Error('Escrow not found');
  }
  
  // Check if user is involved in this escrow
  const isInvolved = escrow.buyer.userId.toString() === userId || 
                   escrow.seller.userId.toString() === userId;
  
  if (!isInvolved) {
    throw new Error('Access denied - not involved in this escrow');
  }
  
  // Check if already disputed
  if (escrow.dispute.isDisputed) {
    throw new Error('Escrow is already under dispute');
  }
  
  // Generate dispute ID
  const disputeId = `DIS_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  
  // Update escrow
  escrow.status = 'disputed';
  escrow.dispute.isDisputed = true;
  escrow.dispute.disputeId = disputeId;
  escrow.dispute.reason = reason;
  escrow.dispute.filedAt = new Date();
  await escrow.save();
  
  // Create notifications for both parties and admin
  const notifications = [
    new Notification({
      recipient: {
        userId: escrow.buyer.userId === userId ? escrow.seller.userId : escrow.buyer.userId,
        anonymousId: escrow.buyer.userId === userId ? escrow.seller.anonymousId : escrow.buyer.anonymousId
      },
      type: 'dispute_filed',
      priority: 'high',
      title: 'Dispute Filed',
      message: `A dispute has been filed for escrow ${escrow.escrowId}. Admin review initiated.`,
      data: {
        escrowId: escrow.escrowId,
        disputeId,
        reason
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    })
  ];
  await Promise.all(notifications.map(n => n.save()));
  
  logger.dispute('filed', disputeId, {
    escrowId: escrow.escrowId,
    filedBy: userId,
    reason
  });
  
  return {
    dispute: {
      disputeId,
      escrowId: escrow.escrowId,
      status: 'open',
      reason,
      filedAt: escrow.dispute.filedAt
    }
  };
};

module.exports = {
  getUserEscrows,
  getEscrowById,
  confirmDelivery,
  markDelivered,
  initiateDispute
};