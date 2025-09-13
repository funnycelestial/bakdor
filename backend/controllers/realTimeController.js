// controllers/realTimeController.js
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const webSocketController = require('./webSocketController');
const logger = require('../utils/logger');

class RealTimeController {
  constructor() {
    this.activeAuctions = new Map();
    this.bidQueues = new Map();
    this.updateInterval = null;
  }

  // Initialize real-time updates
  initialize() {
    this.startPeriodicUpdates();
    this.setupAuctionMonitoring();
    logger.info('Real-time controller initialized');
  }

  // Start periodic updates for auction timers and status
  startPeriodicUpdates() {
    this.updateInterval = setInterval(async () => {
      await this.updateAuctionTimers();
      await this.checkEndingAuctions();
      await this.updateLiveStats();
    }, 1000); // Update every second
  }

  // Monitor active auctions for auto-close
  async setupAuctionMonitoring() {
    try {
      const activeAuctions = await Auction.find({
        status: 'active',
        'timing.endTime': { $gt: new Date() }
      });

      for (const auction of activeAuctions) {
        this.scheduleAuctionEnd(auction);
      }

      logger.info(`Monitoring ${activeAuctions.length} active auctions`);
    } catch (error) {
      logger.error('Error setting up auction monitoring:', error);
    }
  }

  // Schedule auction end
  scheduleAuctionEnd(auction) {
    const timeUntilEnd = new Date(auction.timing.endTime) - new Date();
    
    if (timeUntilEnd > 0) {
      setTimeout(async () => {
        await this.autoCloseAuction(auction.auctionId);
      }, timeUntilEnd);

      logger.info(`Scheduled auto-close for auction ${auction.auctionId} in ${timeUntilEnd}ms`);
    }
  }

  // Auto-close expired auctions
  async autoCloseAuction(auctionId) {
    try {
      const auction = await Auction.findOne({ auctionId })
        .populate('seller.userId', 'anonymousId')
        .populate('bidding.highestBidder.userId', 'anonymousId');

      if (!auction || auction.status !== 'active') {
        return;
      }

      // Check if auction has actually ended
      if (new Date() < auction.timing.endTime) {
        return;
      }

      // End the auction
      await auction.endAuction();

      // Process winner if exists
      if (auction.bidding.highestBidder.userId) {
        // Mark winning bid
        await Bid.findOneAndUpdate(
          {
            'auction.auctionRef': auction._id,
            'bidder.userId': auction.bidding.highestBidder.userId,
            status: 'winning'
          },
          { status: 'won' }
        );

        // Mark other bids as lost
        await Bid.updateMany(
          {
            'auction.auctionRef': auction._id,
            'bidder.userId': { $ne: auction.bidding.highestBidder.userId },
            status: { $in: ['active', 'outbid'] }
          },
          { status: 'lost' }
        );

        // Create platform fee transaction
        const platformFee = auction.pricing.currentBid * 0.03;
        await TokenTransaction.create({
          type: 'fee_payment',
          user: {
            userId: auction.seller.userId._id,
            walletAddress: auction.seller.walletAddress,
            anonymousId: auction.seller.anonymousId
          },
          amount: platformFee,
          fees: {
            platformFee,
            burnAmount: platformFee * 0.5,
            treasuryAmount: platformFee * 0.5
          },
          relatedTo: {
            type: 'auction',
            id: auction.auctionId,
            reference: auction._id
          },
          status: 'confirmed'
        });
      }

      // Broadcast auction end
      webSocketController.broadcastAuctionEnd(auction.auctionId, {
        auctionId: auction.auctionId,
        winner: auction.winner?.anonymousId,
        winningBid: auction.winner?.winningBid,
        endedBy: 'system'
      });

      logger.auction('auto_closed', auction.auctionId, {
        winner: auction.winner?.anonymousId,
        winningBid: auction.winner?.winningBid
      });

    } catch (error) {
      logger.error(`Error auto-closing auction ${auctionId}:`, error);
    }
  }

  // Update auction timers and send to connected clients
  async updateAuctionTimers() {
    try {
      const activeAuctions = await Auction.find({
        status: 'active',
        'timing.endTime': { $gt: new Date() }
      }).select('auctionId timing.endTime');

      for (const auction of activeAuctions) {
        const timeRemaining = new Date(auction.timing.endTime) - new Date();
        
        if (timeRemaining <= 0) {
          // Auction should end
          this.autoCloseAuction(auction.auctionId);
        } else {
          // Broadcast time update
          webSocketController.broadcastToAuction(auction.auctionId, 'time_update', {
            auctionId: auction.auctionId,
            timeRemaining,
            endTime: auction.timing.endTime
          });

          // Send urgent warnings for auctions ending soon
          if (timeRemaining <= 60000 && timeRemaining > 59000) { // 1 minute warning
            webSocketController.broadcastToWatchers(auction.auctionId, 'auction_ending_soon', {
              auctionId: auction.auctionId,
              timeRemaining,
              urgency: 'critical'
            });
          } else if (timeRemaining <= 300000 && timeRemaining > 299000) { // 5 minute warning
            webSocketController.broadcastToWatchers(auction.auctionId, 'auction_ending_soon', {
              auctionId: auction.auctionId,
              timeRemaining,
              urgency: 'high'
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error updating auction timers:', error);
    }
  }

  // Check for auctions that need to end
  async checkEndingAuctions() {
    try {
      const endingAuctions = await Auction.find({
        status: 'active',
        'timing.endTime': { $lte: new Date() }
      });

      for (const auction of endingAuctions) {
        await this.autoCloseAuction(auction.auctionId);
      }
    } catch (error) {
      logger.error('Error checking ending auctions:', error);
    }
  }

  // Update live platform statistics
  async updateLiveStats() {
    try {
      const [activeAuctions, totalBidders, tokensInPlay] = await Promise.all([
        Auction.countDocuments({ status: 'active' }),
        User.countDocuments({ lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        Bid.aggregate([
          { $match: { status: { $in: ['active', 'winning'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      const stats = {
        activeAuctions,
        totalBidders,
        tokensInPlay: tokensInPlay[0]?.total || 0,
        timestamp: new Date()
      };

      // Broadcast stats to all connected users
      webSocketController.broadcastToAll('live_stats_update', stats);

    } catch (error) {
      logger.error('Error updating live stats:', error);
    }
  }

  // Handle bid queue processing (for high-frequency bidding)
  async processBidQueue(auctionId) {
    const queue = this.bidQueues.get(auctionId);
    if (!queue || queue.length === 0) return;

    // Process bids in order
    const bid = queue.shift();
    
    try {
      // Validate and process bid
      const auction = await Auction.findOne({ auctionId });
      if (auction && auction.status === 'active' && new Date() < auction.timing.endTime) {
        // Process the bid
        await this.processSingleBid(bid, auction);
      }
    } catch (error) {
      logger.error('Error processing queued bid:', error);
    }

    // Continue processing queue
    if (queue.length > 0) {
      setTimeout(() => this.processBidQueue(auctionId), 100); // 100ms delay between bids
    }
  }

  // Process individual bid
  async processSingleBid(bidData, auction) {
    try {
      // Create and save bid
      const bid = new Bid(bidData);
      await bid.save();

      // Update auction
      await auction.placeBid(bidData.amount, bidData.bidder);

      // Broadcast update
      webSocketController.broadcastBidUpdate(auction.auctionId, {
        bidder: bidData.bidder.anonymousId,
        amount: bidData.amount,
        isNewHighest: true
      });

    } catch (error) {
      logger.error('Error processing single bid:', error);
    }
  }

  // Add bid to queue (for rate limiting)
  queueBid(auctionId, bidData) {
    if (!this.bidQueues.has(auctionId)) {
      this.bidQueues.set(auctionId, []);
    }
    
    this.bidQueues.get(auctionId).push(bidData);
    
    // Start processing if this is the first bid in queue
    if (this.bidQueues.get(auctionId).length === 1) {
      this.processBidQueue(auctionId);
    }
  }

  // Cleanup
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.activeAuctions.clear();
    this.bidQueues.clear();
    
    logger.info('Real-time controller stopped');
  }
}

module.exports = new RealTimeController();