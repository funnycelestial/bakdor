const TokenTransaction = require('../models/tokenTransactionModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const Escrow = require('../models/escrowModel');
const User = require('../models/userModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Verify webhook signature
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Webhook signature
 * @returns {boolean} - Whether signature is valid
 */
const verifyWebhookSignature = (payload, signature) => {
  if (!signature) {
    return false;
  }
  
  // Get the webhook secret from environment variables
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.warn('WEBHOOK_SECRET not configured, skipping signature verification');
    return true; // Skip verification in development
  }
  
  // Create HMAC using the secret
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(JSON.stringify(payload));
  const digest = hmac.digest('hex');
  
  // Compare with provided signature
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(digest, 'hex')
  );
};

/**
 * Handle blockchain transaction confirmation webhooks
 * @param {Object} payload - Webhook payload containing transaction data
 * @param {string} signature - Webhook signature for verification
 * @returns {Object} - Result of webhook processing
 */
const handleTransactionConfirmation = async (payload, signature) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }
    
    const { transactionHash, status, blockNumber, from, to, value, logs } = payload;
    
    // Find the corresponding transaction record
    const transaction = await TokenTransaction.findOne({
      'blockchain.transactionHash': transactionHash
    });
    
    if (!transaction) {
      logger.warn('Transaction not found for webhook:', { transactionHash });
      return { success: true, message: 'Transaction not tracked' };
    }
    
    // Update transaction status based on blockchain confirmation
    if (status === 'confirmed') {
      transaction.blockchain.isConfirmed = true;
      transaction.blockchain.blockNumber = blockNumber;
      transaction.status = 'confirmed';
      
      // Process based on transaction type
      switch (transaction.type) {
        case 'deposit':
          await processDepositConfirmation(transaction, value);
          break;
        case 'withdrawal':
          await processWithdrawalConfirmation(transaction);
          break;
        case 'transfer':
          await processTransferConfirmation(transaction, logs);
          break;
        case 'escrow_release':
          await processEscrowReleaseConfirmation(transaction);
          break;
        default:
          logger.info('Unhandled transaction type:', { type: transaction.type });
      }
      
      await transaction.save();
    } else if (status === 'failed') {
      transaction.status = 'failed';
      transaction.metadata.failureReason = payload.reason || 'Unknown error';
      await transaction.save();
    }
    
    logger.blockchain('transaction_confirmed', {
      transactionHash,
      type: transaction.type,
      status
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error processing transaction webhook:', error);
    throw error;
  }
};

/**
 * Handle auction event webhooks (created, ended, etc.)
 * @param {Object} payload - Webhook payload containing auction event data
 * @param {string} signature - Webhook signature for verification
 * @returns {Object} - Result of webhook processing
 */
const handleAuctionEvent = async (payload, signature) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }
    
    const { eventType, auctionId, data } = payload;
    
    switch (eventType) {
      case 'auction_created':
        await processAuctionCreated(auctionId, data);
        break;
      case 'auction_ended':
        await processAuctionEnded(auctionId, data);
        break;
      case 'bid_placed':
        await processBidPlaced(auctionId, data);
        break;
      default:
        logger.warn('Unknown auction event type:', { eventType });
    }
    
    logger.blockchain('auction_event_processed', {
      eventType,
      auctionId
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error processing auction webhook:', error);
    throw error;
  }
};

/**
 * Handle token event webhooks (transfer, approval, etc.)
 * @param {Object} payload - Webhook payload containing token event data
 * @param {string} signature - Webhook signature for verification
 * @returns {Object} - Result of webhook processing
 */
const handleTokenEvent = async (payload, signature) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }
    
    const { eventType, from, to, value, transactionHash } = payload;
    
    switch (eventType) {
      case 'transfer':
        await processTokenTransfer(from, to, value, transactionHash);
        break;
      case 'approval':
        await processTokenApproval(from, to, value, transactionHash);
        break;
      default:
        logger.warn('Unknown token event type:', { eventType });
    }
    
    logger.blockchain('token_event_processed', {
      eventType,
      from,
      to,
      value
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error processing token webhook:', error);
    throw error;
  }
};

/**
 * Process deposit confirmation
 * @param {Object} transaction - Transaction record
 * @param {number} value - Transaction value from blockchain
 */
const processDepositConfirmation = async (transaction, value) => {
  // Update user balance
  const user = await User.findById(transaction.user.userId);
  user.balance += parseFloat(value);
  await user.save();
  
  // Send notification to user
  const notification = {
    recipient: {
      userId: transaction.user.userId,
      anonymousId: transaction.user.anonymousId
    },
    type: 'deposit_confirmed',
    priority: 'medium',
    title: 'Deposit Confirmed',
    message: `Your deposit of ${value} WKC has been confirmed.`,
    data: {
      transactionId: transaction.transactionId,
      amount: value
    }
  };
  
  // Emit real-time update
  global.io?.to(transaction.user.userId).emit('deposit_confirmed', {
    transactionId: transaction.transactionId,
    amount: value,
    balance: user.balance
  });
};

/**
 * Process withdrawal confirmation
 * @param {Object} transaction - Transaction record
 */
const processWithdrawalConfirmation = async (transaction) => {
  // Send notification to user
  const notification = {
    recipient: {
      userId: transaction.user.userId,
      anonymousId: transaction.user.anonymousId
    },
    type: 'withdrawal_confirmed',
    priority: 'medium',
    title: 'Withdrawal Confirmed',
    message: `Your withdrawal of ${transaction.amount} WKC has been processed.`,
    data: {
      transactionId: transaction.transactionId,
      amount: transaction.amount
    }
  };
  
  // Emit real-time update
  global.io?.to(transaction.user.userId).emit('withdrawal_confirmed', {
    transactionId: transaction.transactionId,
    amount: transaction.amount
  });
};

/**
 * Process transfer confirmation
 * @param {Object} transaction - Transaction record
 * @param {Array} logs - Transaction logs
 */
const processTransferConfirmation = async (transaction, logs) => {
  // Find recipient transaction
  const recipientTransaction = await TokenTransaction.findOne({
    'blockchain.transactionHash': transaction.blockchain.transactionHash,
    'user.userId': { $ne: transaction.user.userId }
  });
  
  if (recipientTransaction) {
    recipientTransaction.status = 'confirmed';
    await recipientTransaction.save();
    
    // Emit real-time update to recipient
    global.io?.to(recipientTransaction.user.userId).emit('transfer_received', {
      transactionId: recipientTransaction.transactionId,
      amount: recipientTransaction.amount,
      from: transaction.user.anonymousId
    });
  }
  
  // Emit real-time update to sender
  global.io?.to(transaction.user.userId).emit('transfer_sent', {
    transactionId: transaction.transactionId,
    amount: Math.abs(transaction.amount),
    to: recipientTransaction?.user.anonymousId
  });
};

/**
 * Process escrow release confirmation
 * @param {Object} transaction - Transaction record
 */
const processEscrowReleaseConfirmation = async (transaction) => {
  // Update escrow status
  const escrow = await Escrow.findOne({
    'blockchain.transactionHash': transaction.blockchain.transactionHash
  });
  
  if (escrow) {
    escrow.status = 'released';
    await escrow.save();
    
    // Send notifications
    const notifications = [
      {
        recipient: {
          userId: escrow.seller.userId,
          anonymousId: escrow.seller.anonymousId
        },
        type: 'escrow_released',
        priority: 'high',
        title: 'Payment Released',
        message: `Escrow payment of ${escrow.amount} WKC has been released to your wallet.`
      },
      {
        recipient: {
          userId: escrow.buyer.userId,
          anonymousId: escrow.buyer.anonymousId
        },
        type: 'escrow_released',
        priority: 'medium',
        title: 'Escrow Released',
        message: `Escrow payment has been released to the seller.`
      }
    ];
    
    // Emit real-time updates
    global.io?.to(escrow.seller.userId).emit('escrow_released', {
      escrowId: escrow.escrowId,
      amount: escrow.amount
    });
    
    global.io?.to(escrow.buyer.userId).emit('escrow_released', {
      escrowId: escrow.escrowId,
      amount: escrow.amount
    });
  }
};

/**
 * Process auction created event
 * @param {string} auctionId - Auction ID
 * @param {Object} data - Event data
 */
const processAuctionCreated = async (auctionId, data) => {
  // Update auction status
  const auction = await Auction.findOne({ auctionId });
  if (auction) {
    auction.blockchain.isConfirmed = true;
    auction.blockchain.transactionHash = data.transactionHash;
    auction.status = 'active';
    await auction.save();
  }
};

/**
 * Process auction ended event
 * @param {string} auctionId - Auction ID
 * @param {Object} data - Event data
 */
const processAuctionEnded = async (auctionId, data) => {
  // Update auction status
  const auction = await Auction.findOne({ auctionId });
  if (auction) {
    auction.status = 'ended';
    auction.timing.endTime = new Date();
    await auction.save();
    
    // Process winner if exists
    if (data.winner) {
      auction.winner = {
        userId: data.winner.userId,
        anonymousId: data.winner.anonymousId,
        winningBid: data.winningBid,
        wonAt: new Date()
      };
      await auction.save();
    }
  }
};

/**
 * Process bid placed event
 * @param {string} auctionId - Auction ID
 * @param {Object} data - Event data
 */
const processBidPlaced = async (auctionId, data) => {
  // Update auction with bid information
  const auction = await Auction.findOne({ auctionId });
  if (auction) {
    auction.bidding.highestBidder = data.bidder;
    auction.bidding.totalBids += 1;
    auction.pricing.currentBid = data.amount;
    await auction.save();
    
    // Emit real-time update
    global.io?.to(auction.seller.userId).emit('bid_placed', {
      auctionId,
      bidder: data.bidder.anonymousId,
      amount: data.amount
    });
  }
};

/**
 * Process token transfer event
 * @param {string} from - Sender address
 * @param {string} to - Recipient address
 * @param {number} value - Transfer amount
 * @param {string} transactionHash - Transaction hash
 */
const processTokenTransfer = async (from, to, value, transactionHash) => {
  // Check if this is a deposit to platform wallet
  if (to.toLowerCase() === process.env.PLATFORM_WALLET_ADDRESS.toLowerCase()) {
    // Find user by wallet address
    const user = await User.findOne({ walletAddress: from.toLowerCase() });
    if (user) {
      // Create pending deposit transaction
      const transaction = new TokenTransaction({
        type: 'deposit',
        user: {
          userId: user._id,
          walletAddress: user.walletAddress,
          anonymousId: user.anonymousId
        },
        amount: value,
        blockchain: {
          transactionHash,
          isConfirmed: true
        },
        status: 'confirmed'
      });
      
      await transaction.save();
      
      // Update user balance
      user.balance += value;
      await user.save();
      
      // Emit real-time update
      global.io?.to(user._id.toString()).emit('deposit_confirmed', {
        transactionId: transaction.transactionId,
        amount: value,
        balance: user.balance
      });
    }
  }
};

/**
 * Process token approval event
 * @param {string} from - Approver address
 * @param {string} to - Spender address
 * @param {number} value - Approval amount
 * @param {string} transactionHash - Transaction hash
 */
const processTokenApproval = async (from, to, value, transactionHash) => {
  // Log approval events for auditing
  logger.blockchain('token_approval', {
    from,
    to,
    value,
    transactionHash
  });
};

module.exports = {
  handleTransactionConfirmation,
  handleAuctionEvent,
  handleTokenEvent
};