const Dispute = require('../models/disputeModel');
const Escrow = require('../models/escrowModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

/**
 * Get user disputes with filtering and pagination
 * @param {Object} filters - Filter options including status, page, limit
 * @param {string} userId - Current user's ID
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {Object} - Disputes and pagination info
 */
const getUserDisputes = async (filters, userId, isAdmin = false) => {
  const { status, category, priority, page = 1, limit = 20 } = filters;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  let query = {};
  
  if (isAdmin) {
    // Admin can see all disputes
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
  } else {
    // Regular users can only see disputes they're involved in
    query.$or = [
      { 'initiator.userId': userId },
      { 'respondent.userId': userId }
    ];
    if (status) query.status = status;
  }
  
  const [disputes, total] = await Promise.all([
    Dispute.find(query)
      .populate('initiator.userId', 'anonymousId')
      .populate('respondent.userId', 'anonymousId')
      .populate('admin.assignedTo', 'anonymousId')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Dispute.countDocuments(query)
  ]);
  
  return {
    disputes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

/**
 * Get specific dispute details with permission checks
 * @param {string} disputeId - Dispute ID
 * @param {string} userId - Current user's ID
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {Object} - Dispute details
 */
const getDisputeById = async (disputeId, userId, isAdmin = false) => {
  const dispute = await Dispute.findOne({ disputeId })
    .populate('initiator.userId', 'anonymousId')
    .populate('respondent.userId', 'anonymousId')
    .populate('admin.assignedTo', 'anonymousId')
    .populate('communication.from', 'anonymousId')
    .populate('evidence.uploadedBy', 'anonymousId');
  
  if (!dispute) {
    throw new Error('Dispute not found');
  }
  
  // Check if user is involved or is admin
  if (!isAdmin) {
    const isInvolved = dispute.initiator.userId.toString() === userId || 
                     dispute.respondent.userId.toString() === userId;
    
    if (!isInvolved) {
      throw new Error('Access denied - not involved in this dispute');
    }
  }
  
  return dispute;
};

/**
 * Create a new dispute
 * @param {Object} disputeData - Dispute data including escrow ID, reason, etc.
 * @param {Object} userInfo - User information
 * @returns {Object} - Created dispute
 */
const createDispute = async (disputeData, userInfo) => {
  const { 
    escrowId, 
    reason, 
    description, 
    category, 
    requestedResolution,
    evidence = [] 
  } = disputeData;
  const { userId, anonymousId, role } = userInfo;
  
  // Get escrow details
  const escrow = await Escrow.findOne({ escrowId });
  if (!escrow) {
    throw new Error('Escrow not found');
  }
  
  // Check if user is involved in the escrow
  const isBuyer = escrow.buyer.userId.toString() === userId;
  const isSeller = escrow.seller.userId.toString() === userId;
  
  if (!isBuyer && !isSeller) {
    throw new Error('Access denied - not involved in this escrow');
  }
  
  // Check if dispute already exists for this escrow
  const existingDispute = await Dispute.findOne({ escrowId });
  if (existingDispute) {
    throw new Error('A dispute already exists for this escrow');
  }
  
  // Determine user role in the dispute
  const userRole = isBuyer ? 'buyer' : 'seller';
  
  // Determine the other party
  const otherParty = isBuyer ? 
    { userId: escrow.seller.userId, anonymousId: escrow.seller.anonymousId, role: 'seller' } :
    { userId: escrow.buyer.userId, anonymousId: escrow.buyer.anonymousId, role: 'buyer' };
  
  // Generate dispute ID
  const disputeId = await Dispute.generateDisputeId();
  
  // Create dispute
  const dispute = new Dispute({
    disputeId,
    escrowId,
    auction: {
      auctionId: escrow.auction.auctionId,
      auctionRef: escrow.auction.auctionRef
    },
    initiator: {
      userId,
      anonymousId,
      role: userRole
    },
    respondent: otherParty,
    reason,
    description,
    category,
    requestedResolution,
    status: 'open',
    timeline: [{
      status: 'open',
      timestamp: new Date(),
      notes: 'Dispute opened',
      updatedBy: userId
    }]
  });
  
  // Add initial evidence if provided
  evidence.forEach(item => {
    dispute.evidence.push({
      type: item.type,
      content: item.content,
      description: item.description,
      uploadedBy: userId,
      uploadedAt: new Date()
    });
  });
  
  await dispute.save();
  
  // Update escrow status
  escrow.status = 'disputed';
  escrow.dispute.isDisputed = true;
  escrow.dispute.disputeId = disputeId;
  escrow.dispute.filedAt = new Date();
  await escrow.save();
  
  // Notify the other party
  const notification = new Notification({
    recipient: {
      userId: otherParty.userId,
      anonymousId: otherParty.anonymousId
    },
    type: 'dispute_filed',
    priority: 'high',
    title: 'Dispute Filed',
    message: `A dispute has been filed for escrow ${escrowId}.`,
    data: {
      disputeId,
      escrowId,
      reason
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });
  await notification.save();
  
  // Notify admins
  const adminNotification = new Notification({
    recipient: {
      userId: 'admin', // This would be handled differently in a real system
      anonymousId: 'admin'
    },
    type: 'new_dispute',
    priority: 'medium',
    title: 'New Dispute Filed',
    message: `A new dispute has been filed: ${disputeId}`,
    data: {
      disputeId,
      escrowId,
      category,
      priority: dispute.priority
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });
  await adminNotification.save();
  
  logger.dispute('created', disputeId, {
    filedBy: userId,
    escrowId,
    category,
    reason
  });
  
  return dispute;
};

/**
 * Add response to dispute
 * @param {string} disputeId - Dispute ID
 * @param {Object} responseData - Response data including message and evidence
 * @param {Object} userInfo - User information
 * @returns {Object} - Updated dispute
 */
const addDisputeResponse = async (disputeId, responseData, userInfo) => {
  const { message, evidence = [] } = responseData;
  const { userId, anonymousId } = userInfo;
  
  const dispute = await Dispute.findOne({ disputeId });
  if (!dispute) {
    throw new Error('Dispute not found');
  }
  
  // Check if user is involved
  const isInvolved = dispute.initiator.userId.toString() === userId || 
                   dispute.respondent.userId.toString() === userId;
  
  if (!isInvolved) {
    throw new Error('Access denied - not involved in this dispute');
  }
  
  // Check if dispute is still open
  if (dispute.status === 'resolved' || dispute.status === 'closed') {
    throw new Error('Cannot add response to a resolved or closed dispute');
  }
  
  // Add communication
  dispute.communication.push({
    from: userId,
    message,
    timestamp: new Date(),
    isAdminMessage: false
  });
  
  // Add evidence if provided
  evidence.forEach(item => {
    dispute.evidence.push({
      type: item.type,
      content: item.content,
      description: item.description,
      uploadedBy: userId,
      uploadedAt: new Date()
    });
  });
  
  await dispute.save();
  
  // Notify the other party
  const otherPartyId = dispute.initiator.userId.toString() === userId ? 
                      dispute.respondent.userId : dispute.initiator.userId;
  const otherPartyAnonymousId = dispute.initiator.userId.toString() === userId ? 
                               dispute.respondent.anonymousId : dispute.initiator.anonymousId;
  
  const notification = new Notification({
    recipient: {
      userId: otherPartyId,
      anonymousId: otherPartyAnonymousId
    },
    type: 'dispute_response',
    priority: 'medium',
    title: 'New Dispute Response',
    message: `A new response has been added to dispute ${disputeId}`,
    data: {
      disputeId,
      escrowId: dispute.escrowId
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });
  await notification.save();
  
  logger.dispute('response_added', disputeId, {
    responderId: userId,
    messageLength: message.length,
    evidenceCount: evidence.length
  });
  
  return dispute;
};

/**
 * Resolve dispute (admin only)
 * @param {string} disputeId - Dispute ID
 * @param {Object} resolutionData - Resolution data including decision and reasoning
 * @param {Object} adminInfo - Admin information
 * @returns {Object} - Updated dispute
 */
const resolveDispute = async (disputeId, resolutionData, adminInfo) => {
  const { decision, reasoning, refundPercentage = 0 } = resolutionData;
  const { userId, anonymousId } = adminInfo;
  
  const dispute = await Dispute.findOne({ disputeId });
  if (!dispute) {
    throw new Error('Dispute not found');
  }
  
  // Update dispute
  dispute.status = 'resolved';
  dispute.resolution = {
    decision,
    reasoning,
    resolvedAt: new Date(),
    resolvedBy: userId,
    refundPercentage,
    refundAmount: dispute.calculateRefundAmount(refundPercentage)
  };
  dispute.admin.assignedTo = userId;
  dispute.admin.assignedAt = new Date();
  
  await dispute.save();
  
  // Get escrow details
  const escrow = await Escrow.findOne({ escrowId: dispute.escrowId });
  if (escrow) {
    // Update escrow status based on decision
    escrow.dispute.resolution = decision;
    escrow.dispute.resolvedAt = new Date();
    escrow.dispute.notes = reasoning;
    
    // Process resolution based on decision
    if (decision === 'buyer_favor') {
      // Full refund to buyer
      await processBuyerRefund(escrow, refundPercentage);
    } else if (decision === 'seller_favor') {
      // Release payment to seller
      await processSellerPayment(escrow);
    } else if (decision === 'partial_refund') {
      // Partial refund to buyer
      await processPartialRefund(escrow, refundPercentage);
    }
    // For 'no_action', escrow remains in disputed state
    
    await escrow.save();
  }
  
  // Create notifications for both parties
  const notifications = [
    new Notification({
      recipient: {
        userId: dispute.initiator.userId,
        anonymousId: dispute.initiator.anonymousId
      },
      type: 'dispute_resolved',
      priority: 'high',
      title: 'Dispute Resolved',
      message: `Dispute ${disputeId} has been resolved.`,
      data: {
        disputeId,
        decision,
        reasoning,
        refundPercentage
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    }),
    new Notification({
      recipient: {
        userId: dispute.respondent.userId,
        anonymousId: dispute.respondent.anonymousId
      },
      type: 'dispute_resolved',
      priority: 'high',
      title: 'Dispute Resolved',
      message: `Dispute ${disputeId} has been resolved.`,
      data: {
        disputeId,
        decision,
        reasoning,
        refundPercentage
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    })
  ];
  
  await Promise.all(notifications.map(n => n.save()));
  
  logger.dispute('resolved', disputeId, {
    resolvedBy: userId,
    decision,
    refundPercentage
  });
  
  return dispute;
};

/**
 * Assign dispute to admin
 * @param {string} disputeId - Dispute ID
 * @param {Object} assignmentData - Assignment data including admin ID and notes
 * @returns {Object} - Updated dispute
 */
const assignDispute = async (disputeId, assignmentData) => {
  const { adminId, notes, estimatedResolutionDate } = assignmentData;
  
  const dispute = await Dispute.findOne({ disputeId });
  if (!dispute) {
    throw new Error('Dispute not found');
  }
  
  // Assign admin
  await dispute.assignAdmin(adminId, notes, estimatedResolutionDate);
  
  // Notify the user who filed the dispute
  const notification = new Notification({
    recipient: {
      userId: dispute.initiator.userId,
      anonymousId: dispute.initiator.anonymousId
    },
    type: 'dispute_assigned',
    priority: 'medium',
    title: 'Dispute Assigned',
    message: `Your dispute ${disputeId} has been assigned to an admin for review.`,
    data: {
      disputeId,
      estimatedResolutionDate
    },
    channels: {
      inApp: { enabled: true },
      email: { enabled: true }
    }
  });
  await notification.save();
  
  logger.dispute('assigned', disputeId, {
    assignedTo: adminId,
    estimatedResolutionDate
  });
  
  return dispute;
};

/**
 * Get dispute statistics
 * @returns {Object} - Dispute statistics
 */
const getDisputeStatistics = async () => {
  return await Dispute.getStatistics();
};

/**
 * Process buyer refund
 * @param {Object} escrow - Escrow object
 * @param {number} refundPercentage - Percentage to refund
 */
const processBuyerRefund = async (escrow, refundPercentage = 100) => {
  // Calculate refund amount
  const refundAmount = escrow.amount * (refundPercentage / 100);
  
  // Transfer tokens back to buyer
  const transferResult = await web3Service.transferFromPlatform(
    escrow.buyer.walletAddress,
    refundAmount,
    escrow.buyer.userId
  );
  
  // Update escrow status
  escrow.status = 'refunded';
  
  // Create transaction record
  const TokenTransaction = require('../models/tokenTransactionModel');
  const refundTransaction = new TokenTransaction({
    type: 'refund',
    user: {
      userId: escrow.buyer.userId,
      walletAddress: escrow.buyer.walletAddress,
      anonymousId: escrow.buyer.anonymousId
    },
    amount: refundAmount,
    blockchain: {
      transactionHash: transferResult.transactionHash,
      blockNumber: transferResult.blockNumber,
      gasUsed: transferResult.gasUsed,
      isConfirmed: true
    },
    status: 'confirmed',
    relatedTo: {
      type: 'dispute',
      id: escrow.dispute.disputeId,
      reference: escrow._id
    }
  });
  
  await refundTransaction.save();
  
  logger.dispute('buyer_refund_processed', escrow.escrowId, {
    buyerId: escrow.buyer.userId,
    refundAmount,
    refundPercentage
  });
};

/**
 * Process seller payment
 * @param {Object} escrow - Escrow object
 */
const processSellerPayment = async (escrow) => {
  // Release payment to seller
  const transferResult = await web3Service.transferFromPlatform(
    escrow.seller.walletAddress,
    escrow.amount,
    escrow.seller.userId
  );
  
  // Update escrow status
  escrow.status = 'completed';
  
  // Create transaction record
  const TokenTransaction = require('../models/tokenTransactionModel');
  const paymentTransaction = new TokenTransaction({
    type: 'escrow_release',
    user: {
      userId: escrow.seller.userId,
      walletAddress: escrow.seller.walletAddress,
      anonymousId: escrow.seller.anonymousId
    },
    amount: escrow.amount,
    blockchain: {
      transactionHash: transferResult.transactionHash,
      blockNumber: transferResult.blockNumber,
      gasUsed: transferResult.gasUsed,
      isConfirmed: true
    },
    status: 'confirmed',
    relatedTo: {
      type: 'dispute',
      id: escrow.dispute.disputeId,
      reference: escrow._id
    }
  });
  
  await paymentTransaction.save();
  
  logger.dispute('seller_payment_processed', escrow.escrowId, {
    sellerId: escrow.seller.userId,
    amount: escrow.amount
  });
};

/**
 * Process partial refund
 * @param {Object} escrow - Escrow object
 * @param {number} refundPercentage - Percentage to refund
 */
const processPartialRefund = async (escrow, refundPercentage) => {
  // Calculate amounts
  const refundAmount = escrow.amount * (refundPercentage / 100);
  const sellerAmount = escrow.amount - refundAmount;
  
  // Transfer refund to buyer
  const buyerRefundResult = await web3Service.transferFromPlatform(
    escrow.buyer.walletAddress,
    refundAmount,
    escrow.buyer.userId
  );
  
  // Transfer remaining amount to seller
  const sellerPaymentResult = await web3Service.transferFromPlatform(
    escrow.seller.walletAddress,
    sellerAmount,
    escrow.seller.userId
  );
  
  // Update escrow status
  escrow.status = 'completed';
  
  // Create transaction records
  const TokenTransaction = require('../models/tokenTransactionModel');
  
  const buyerRefundTransaction = new TokenTransaction({
    type: 'refund',
    user: {
      userId: escrow.buyer.userId,
      walletAddress: escrow.buyer.walletAddress,
      anonymousId: escrow.buyer.anonymousId
    },
    amount: refundAmount,
    blockchain: {
      transactionHash: buyerRefundResult.transactionHash,
      blockNumber: buyerRefundResult.blockNumber,
      gasUsed: buyerRefundResult.gasUsed,
      isConfirmed: true
    },
    status: 'confirmed',
    relatedTo: {
      type: 'dispute',
      id: escrow.dispute.disputeId,
      reference: escrow._id
    }
  });
  
  const sellerPaymentTransaction = new TokenTransaction({
    type: 'escrow_release',
    user: {
      userId: escrow.seller.userId,
      walletAddress: escrow.seller.walletAddress,
      anonymousId: escrow.seller.anonymousId
    },
    amount: sellerAmount,
    blockchain: {
      transactionHash: sellerPaymentResult.transactionHash,
      blockNumber: sellerPaymentResult.blockNumber,
      gasUsed: sellerPaymentResult.gasUsed,
      isConfirmed: true
    },
    status: 'confirmed',
    relatedTo: {
      type: 'dispute',
      id: escrow.dispute.disputeId,
      reference: escrow._id
    }
  });
  
  await Promise.all([
    buyerRefundTransaction.save(),
    sellerPaymentTransaction.save()
  ]);
  
  logger.dispute('partial_refund_processed', escrow.escrowId, {
    buyerId: escrow.buyer.userId,
    sellerId: escrow.seller.userId,
    refundAmount,
    sellerAmount,
    refundPercentage
  });
};

module.exports = {
  getUserDisputes,
  getDisputeById,
  createDispute,
  addDisputeResponse,
  resolveDispute,
  assignDispute,
  getDisputeStatistics
};