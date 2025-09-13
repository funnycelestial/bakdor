const Bull = require('bull');
const redisClient = require('../config/redis');
const notificationService = require('./notificationService');
const web3Service = require('./web3Service');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const logger = require('../utils/logger');

// Create queues
const notificationQueue = new Bull('notification processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

const auctionQueue = new Bull('auction processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

const blockchainQueue = new Bull('blockchain processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Notification queue processors
notificationQueue.process('send_notification', async (job) => {
  const { notificationData } = job.data;
  
  try {
    await notificationService.sendNotification(notificationData);
    logger.info(`Notification processed: ${notificationData.type}`);
  } catch (error) {
    logger.error('Error processing notification job:', error);
    throw error;
  }
});

notificationQueue.process('send_bulk_notification', async (job) => {
  const { userIds, notificationData } = job.data;
  
  try {
    const result = await notificationService.sendBulkNotification(userIds, notificationData);
    logger.info(`Bulk notification processed: ${result.successful}/${userIds.length} sent`);
  } catch (error) {
    logger.error('Error processing bulk notification job:', error);
    throw error;
  }
});

// Auction queue processors
auctionQueue.process('end_auction', async (job) => {
  const { auctionId } = job.data;
  
  try {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'active') {
      return;
    }

    // End auction
    await auction.endAuction();

    // Process winning bid
    if (auction.winner) {
      // Create escrow
      const escrowResult = await web3Service.createEscrowOnChain(
        auction.auctionId,
        auction.winner.walletAddress,
        auction.seller.walletAddress,
        auction.winner.winningBid
      );

      // Update auction with escrow info
      auction.escrow.escrowId = escrowResult.escrowId;
      auction.escrow.status = 'created';
      auction.escrow.contractAddress = escrowResult.contractAddress;
      await auction.save();

      // Send notifications
      await notificationService.sendNotification({
        recipient: {
          userId: auction.winner.userId,
          anonymousId: auction.winner.anonymousId
        },
        type: 'auction_won',
        priority: 'high',
        title: 'Auction Won!',
        message: `Congratulations! You won the auction for "${auction.title}".`,
        data: {
          auctionId: auction.auctionId,
          winningBid: auction.winner.winningBid,
          escrowId: escrowResult.escrowId
        },
        channels: {
          inApp: { enabled: true },
          email: { enabled: true }
        }
      });
    }

    // Refund losing bids
    const losingBids = await Bid.find({
      'auction.auctionRef': auction._id,
      status: { $in: ['active', 'outbid'] }
    });

    for (const bid of losingBids) {
      if (bid.bidder.userId.toString() !== auction.winner?.userId?.toString()) {
        // Add refund job to blockchain queue
        await blockchainQueue.add('refund_bid', {
          bidId: bid._id,
          amount: bid.amount,
          walletAddress: bid.bidder.walletAddress
        });
      }
    }

    logger.auction('ended_by_system', auction.auctionId, {
      winner: auction.winner?.anonymousId,
      winningBid: auction.winner?.winningBid
    });

  } catch (error) {
    logger.error('Error processing auction end job:', error);
    throw error;
  }
});

// Blockchain queue processors
blockchainQueue.process('refund_bid', async (job) => {
  const { bidId, amount, walletAddress } = job.data;
  
  try {
    const bid = await Bid.findById(bidId);
    if (!bid) return;

    // Refund tokens on blockchain
    const refundResult = await web3Service.transferTokens(walletAddress, amount);

    // Update bid status
    await bid.refund('Auction ended - not winning bid', refundResult.transactionHash);

    // Create refund transaction record
    const refundTransaction = new TokenTransaction({
      type: 'refund',
      user: {
        userId: bid.bidder.userId,
        walletAddress: bid.bidder.walletAddress,
        anonymousId: bid.bidder.anonymousId
      },
      amount,
      blockchain: {
        transactionHash: refundResult.transactionHash,
        blockNumber: refundResult.blockNumber,
        gasUsed: refundResult.gasUsed,
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

    // Send notification
    await notificationService.sendNotification({
      recipient: {
        userId: bid.bidder.userId,
        anonymousId: bid.bidder.anonymousId
      },
      type: 'bid_refunded',
      priority: 'medium',
      title: 'Bid Refunded',
      message: `Your bid of ${amount} WKC has been refunded as the auction has ended.`,
      data: {
        bidId: bid.bidId,
        amount,
        transactionHash: refundResult.transactionHash
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    });

    logger.payment('refund_completed', amount, 'WKC', {
      bidId: bid.bidId,
      userId: bid.bidder.userId,
      transactionHash: refundResult.transactionHash
    });

  } catch (error) {
    logger.error('Error processing bid refund job:', error);
    throw error;
  }
});

// Schedule auction end jobs
const scheduleAuctionEnd = async (auctionId, endTime) => {
  const delay = new Date(endTime) - new Date();
  
  if (delay > 0) {
    await auctionQueue.add('end_auction', { auctionId }, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    logger.info(`Scheduled auction end job for ${auctionId} in ${delay}ms`);
  }
};

// Schedule notification
const scheduleNotification = async (notificationData, scheduledFor) => {
  const delay = new Date(scheduledFor) - new Date();
  
  if (delay > 0) {
    await notificationQueue.add('send_notification', { notificationData }, {
      delay,
      attempts: 3
    });

    logger.info(`Scheduled notification for ${delay}ms`);
  }
};

// Queue event handlers
notificationQueue.on('completed', (job) => {
  logger.info(`Notification job completed: ${job.id}`);
});

notificationQueue.on('failed', (job, err) => {
  logger.error(`Notification job failed: ${job.id}`, err);
});

auctionQueue.on('completed', (job) => {
  logger.info(`Auction job completed: ${job.id}`);
});

auctionQueue.on('failed', (job, err) => {
  logger.error(`Auction job failed: ${job.id}`, err);
});

blockchainQueue.on('completed', (job) => {
  logger.info(`Blockchain job completed: ${job.id}`);
});

blockchainQueue.on('failed', (job, err) => {
  logger.error(`Blockchain job failed: ${job.id}`, err);
});

// Cleanup completed jobs periodically
setInterval(async () => {
  try {
    await notificationQueue.clean(24 * 60 * 60 * 1000, 'completed');
    await auctionQueue.clean(24 * 60 * 60 * 1000, 'completed');
    await blockchainQueue.clean(24 * 60 * 60 * 1000, 'completed');
    
    // Cleanup expired notifications
    await notificationService.cleanupExpiredNotifications();
  } catch (error) {
    logger.error('Error during queue cleanup:', error);
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = {
  notificationQueue,
  auctionQueue,
  blockchainQueue,
  scheduleAuctionEnd,
  scheduleNotification,
  notificationService
};