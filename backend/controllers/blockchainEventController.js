// controllers/blockchainEventController.js
const { ethers } = require('ethers');
const { wkcToken, auction, escrow } = require('../utils/abi');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');
const webSocketController = require('./webSocketController');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const webSocketManager = require('../config/websocket');
const RateLimiter = require('../utils/rateLimiter');

class BlockchainEventController {
  constructor() {
    this.provider = null;
    this.wsProvider = null;
    this.contracts = {};
    this.wsContracts = {};
    this.eventListeners = new Map();
    this.isListening = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.blockchainRateLimiter = new RateLimiter(30, 60000); // 30 requests per minute
    this.totalBurnedCache = null;
    this.lastCacheUpdate = 0;
    this.cacheValidityMs = 60000; // Cache valid for 1 minute
    this.initialize();
  }

  async initialize() {
    try {
      // Skip WebSocket initialization in development mode
      if (process.env.NODE_ENV !== 'production') {
        logger.info('Skipping WebSocket initialization in development mode');
        return;
      }

      // Initialize HTTP provider for queries
      this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      
      // Use the shared WebSocket provider from WebSocketManager
      await webSocketManager.connect();
      this.wsProvider = webSocketManager.getProvider();
      
      // Wait for WebSocket to be ready
      if (!this.wsProvider || !webSocketManager.isReady()) {
        logger.info('Waiting for WebSocket provider to be ready...');
        await new Promise((resolve) => {
          const checkReady = setInterval(() => {
            if (webSocketManager.isReady()) {
              clearInterval(checkReady);
              resolve();
            }
          }, 1000);
        });
      }
      
      logger.info('WebSocket provider is ready, initializing contracts');
      
      // Initialize contracts with EVENT-ONLY ABI
      await this.initializeContracts();
      
      // Start listening to events
      this.startWebSocketEventListening();
      
      logger.info('Blockchain event controller initialized with shared WebSocket');
    } catch (error) {
      logger.error('Failed to initialize blockchain event controller:', error);
      throw error;
    }
  }

  async initializeContracts() {
    try {
      // Initialize contract instances with EVENT-ONLY ABI
      if (process.env.WKC_CONTRACT_ADDRESS) {
        this.contracts.wkcToken = new ethers.Contract(
          process.env.WKC_CONTRACT_ADDRESS,
          wkcToken.event, // Using event-only ABI
          this.provider
        );
        
        this.wsContracts.wkcToken = new ethers.Contract(
          process.env.WKC_CONTRACT_ADDRESS,
          wkcToken.event, // Using event-only ABI
          this.wsProvider
        );
      }
      
      if (process.env.AUCTION_CONTRACT_ADDRESS) {
        this.contracts.auction = new ethers.Contract(
          process.env.AUCTION_CONTRACT_ADDRESS,
          auction.event, // Using event-only ABI
          this.provider
        );
        
        this.wsContracts.auction = new ethers.Contract(
          process.env.AUCTION_CONTRACT_ADDRESS,
          auction.event, // Using event-only ABI
          this.wsProvider
        );
      }
      
      if (process.env.ESCROW_CONTRACT_ADDRESS) {
        this.contracts.escrow = new ethers.Contract(
          process.env.ESCROW_CONTRACT_ADDRESS,
          escrow.event, // Using event-only ABI
          this.provider
        );
        
        this.wsContracts.escrow = new ethers.Contract(
          process.env.ESCROW_CONTRACT_ADDRESS,
          escrow.event, // Using event-only ABI
          this.wsProvider
        );
      }
      
      logger.info('Blockchain contracts initialized with event-only ABI');
    } catch (error) {
      logger.error('Failed to initialize contracts:', error);
      throw error;
    }
  }


  startWebSocketEventListening() {
    if (!this.wsProvider || this.isListening) return;
    
    try {
      // Use block event to know we're connected
      const blockListener = (blockNumber) => {
        if (!this.isListening) {
          logger.info('Blockchain WebSocket connected');
          this.isListening = true;
          this.reconnectAttempts = 0;
        }
        logger.debug(`New block received: ${blockNumber}`);
      };
      
      this.wsProvider.on('block', blockListener);
      this.eventListeners.set('block', blockListener);
      
      // Listen for provider errors
      const errorListener = (error) => {
        logger.error('Blockchain WebSocket error:', error);
        this.isListening = false;
        // Reconnection is handled by WebSocketManager
      };
      
      this.wsProvider.on('error', errorListener);
      this.eventListeners.set('error', errorListener);
      
      // Listen for token events
      if (this.wsContracts.wkcToken) {
        const tokensBurnedListener = (amount, burner, reason, event) => {
          this.handleTokensBurned(amount, burner, reason, event);
        };
        
        this.wsContracts.wkcToken.on('TokensBurned', tokensBurnedListener);
        this.eventListeners.set('TokensBurned', tokensBurnedListener);
        
        const transferListener = (from, to, value, event) => {
          this.handleTokenTransfer(from, to, value, event);
        };
        
        this.wsContracts.wkcToken.on('Transfer', transferListener);
        this.eventListeners.set('Transfer', transferListener);
      }
      
      // Listen for auction events
      if (this.wsContracts.auction) {
        const auctionCreatedListener = (auctionId, seller, title, startingBid, endTime, isReverse, event) => {
          this.handleAuctionCreated(auctionId, seller, title, startingBid, endTime, isReverse, event);
        };
        
        this.wsContracts.auction.on('AuctionCreated', auctionCreatedListener);
        this.eventListeners.set('AuctionCreated', auctionCreatedListener);
        
        const bidPlacedListener = (auctionId, bidder, amount, timestamp, event) => {
          this.handleBidPlaced(auctionId, bidder, amount, timestamp, event);
        };
        
        this.wsContracts.auction.on('BidPlaced', bidPlacedListener);
        this.eventListeners.set('BidPlaced', bidPlacedListener);
        
        const auctionEndedListener = (auctionId, winner, winningBid, platformFee, burnedAmount, event) => {
          this.handleAuctionEnded(auctionId, winner, winningBid, platformFee, burnedAmount, event);
        };
        
        this.wsContracts.auction.on('AuctionEnded', auctionEndedListener);
        this.eventListeners.set('AuctionEnded', auctionEndedListener);
        
        const auctionTokensBurnedListener = (amount, auctionId, reason, event) => {
          this.handleAuctionTokensBurned(amount, auctionId, reason, event);
        };
        
        this.wsContracts.auction.on('TokensBurned', auctionTokensBurnedListener);
        this.eventListeners.set('AuctionTokensBurned', auctionTokensBurnedListener);
      }
      
      // Listen for escrow events
      if (this.wsContracts.escrow) {
        const escrowCreatedListener = (escrowId, auctionId, buyer, seller, amount, event) => {
          this.handleEscrowCreated(escrowId, auctionId, buyer, seller, amount, event);
        };
        
        this.wsContracts.escrow.on('EscrowCreated', escrowCreatedListener);
        this.eventListeners.set('EscrowCreated', escrowCreatedListener);
        
        const escrowCompletedListener = (escrowId, amount, event) => {
          this.handleEscrowCompleted(escrowId, amount, event);
        };
        
        this.wsContracts.escrow.on('EscrowCompleted', escrowCompletedListener);
        this.eventListeners.set('EscrowCompleted', escrowCompletedListener);
        
        const disputeRaisedListener = (escrowId, reason, raisedBy, event) => {
          this.handleDisputeRaised(escrowId, reason, raisedBy, event);
        };
        
        this.wsContracts.escrow.on('DisputeRaised', disputeRaisedListener);
        this.eventListeners.set('DisputeRaised', disputeRaisedListener);
      }
      
      logger.info('WebSocket blockchain event listening started');
    } catch (error) {
      logger.error('Error starting event listeners:', error);
    }
  }

  stopEventListening() {
    try {
      // Remove all stored event listeners
      for (const [event, listener] of this.eventListeners) {
        if (this.wsContracts.wkcToken && (event.startsWith('Tokens') || event === 'Transfer')) {
          this.wsContracts.wkcToken.off(event, listener);
        } else if (this.wsContracts.auction && (event.startsWith('Auction') || event === 'BidPlaced')) {
          this.wsContracts.auction.off(event, listener);
        } else if (this.wsContracts.escrow && (event.startsWith('Escrow') || event === 'DisputeRaised')) {
          this.wsContracts.escrow.off(event, listener);
        } else if (this.wsProvider && (event === 'block' || event === 'error')) {
          this.wsProvider.off(event, listener);
        }
      }
      
      this.eventListeners.clear();
      this.isListening = false;
      logger.info('Blockchain event listening stopped');
    } catch (error) {
      logger.error('Error stopping event listeners:', error);
    }
  }

  // Event Handlers with caching and rate limiting
  async handleTokensBurned(amount, burner, reason, event) {
    try {
      const burnAmount = ethers.formatUnits(amount, 18);
      
      logger.blockchain('tokens_burned', {
        amount: burnAmount,
        burner,
        reason,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber
      });
      
      // Update cache with new burn amount
      if (this.totalBurnedCache) {
        this.totalBurnedCache = (parseFloat(this.totalBurnedCache) + parseFloat(burnAmount)).toString();
        this.lastCacheUpdate = Date.now();
      }
      
      // Create burn transaction record
      const burnTransaction = new TokenTransaction({
        type: 'fee_burn',
        user: {
          userId: null,
          walletAddress: burner,
          anonymousId: 'SYSTEM_BURN'
        },
        amount: parseFloat(burnAmount),
        blockchain: {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          isConfirmed: true
        },
        status: 'confirmed',
        metadata: {
          description: reason,
          source: 'blockchain',
          initiatedBy: 'system'
        }
      });
      await burnTransaction.save();
      
      // Broadcast burn event to all connected users
      webSocketController.broadcastTokensBurned({
        amount: burnAmount,
        reason,
        transactionHash: event.transactionHash,
        totalBurned: this.totalBurnedCache || await this.getTotalBurned()
      });
    } catch (error) {
      logger.error('Error handling tokens burned event:', error);
    }
  }

  async handleTokenTransfer(from, to, value, event) {
    try {
      const transferAmount = ethers.formatUnits(value, 18);
      
      // Log significant transfers
      if (parseFloat(transferAmount) > 1000) {
        logger.blockchain('large_transfer', {
          from,
          to,
          amount: transferAmount,
          transactionHash: event.transactionHash
        });
      }
      
      // Update user balances if they're platform users
      const [fromUser, toUser] = await Promise.all([
        User.findOne({ walletAddress: from.toLowerCase() }),
        User.findOne({ walletAddress: to.toLowerCase() })
      ]);
      
      if (fromUser || toUser) {
        // Create transaction records for platform users
        const transactions = [];
        
        if (fromUser) {
          transactions.push({
            type: 'transfer',
            user: {
              userId: fromUser._id,
              walletAddress: fromUser.walletAddress,
              anonymousId: fromUser.anonymousId
            },
            amount: -parseFloat(transferAmount),
            blockchain: {
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
              isConfirmed: true
            },
            status: 'confirmed'
          });
        }
        
        if (toUser) {
          transactions.push({
            type: 'transfer',
            user: {
              userId: toUser._id,
              walletAddress: toUser.walletAddress,
              anonymousId: toUser.anonymousId
            },
            amount: parseFloat(transferAmount),
            blockchain: {
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
              isConfirmed: true
            },
            status: 'confirmed'
          });
        }
        
        if (transactions.length > 0) {
          await TokenTransaction.insertMany(transactions);
        }
      }
    } catch (error) {
      logger.error('Error handling token transfer event:', error);
    }
  }

  async handleAuctionCreated(auctionId, seller, title, startingBid, endTime, isReverse, event) {
    try {
      logger.blockchain('auction_created', {
        auctionId: auctionId.toString(),
        seller,
        title,
        startingBid: ethers.formatUnits(startingBid, 18),
        isReverse,
        transactionHash: event.transactionHash
      });
      
      // Update database auction with blockchain info
      await Auction.findOneAndUpdate(
        { 
          'seller.walletAddress': seller.toLowerCase(),
          title: title,
          status: { $in: ['draft', 'pending'] }
        },
        {
          $set: {
            'blockchain.contractAddress': this.contracts.auction.target,
            'blockchain.transactionHash': event.transactionHash,
            'blockchain.blockNumber': event.blockNumber,
            'blockchain.isOnChain': true,
            status: 'pending' // Pending admin approval
          }
        }
      );
      
      // Broadcast new auction to all users
      webSocketController.broadcastToAll('auction_created', {
        auctionId: auctionId.toString(),
        title,
        seller,
        startingBid: ethers.formatUnits(startingBid, 18),
        isReverse
      });
    } catch (error) {
      logger.error('Error handling auction created event:', error);
    }
  }

  async handleBidPlaced(auctionId, bidder, amount, timestamp, event) {
    try {
      const bidAmount = ethers.formatUnits(amount, 18);
      
      logger.blockchain('bid_placed', {
        auctionId: auctionId.toString(),
        bidder,
        amount: bidAmount,
        transactionHash: event.transactionHash
      });
      
      // Update bid status in database
      await Bid.findOneAndUpdate(
        { 
          'auction.auctionId': auctionId.toString(),
          'bidder.walletAddress': bidder.toLowerCase(),
          status: 'pending'
        },
        {
          $set: {
            'blockchain.transactionHash': event.transactionHash,
            'blockchain.blockNumber': event.blockNumber,
            'blockchain.isOnChain': true,
            status: 'active',
            'timing.confirmedAt': new Date()
          }
        }
      );
      
      // Update auction with new highest bid
      await Auction.findOneAndUpdate(
        { auctionId: auctionId.toString() },
        {
          $set: {
            'pricing.currentBid': parseFloat(bidAmount),
            'bidding.lastBidTime': new Date()
          },
          $inc: {
            'bidding.totalBids': 1
          }
        }
      );
      
      // Find bidder user for anonymous ID
      const bidderUser = await User.findOne({ walletAddress: bidder.toLowerCase() });
      
      // Broadcast bid update
      webSocketController.broadcastBidUpdate(auctionId.toString(), {
        bidder: bidderUser?.anonymousId || bidder,
        amount: bidAmount,
        isNewHighest: true,
        transactionHash: event.transactionHash
      });
    } catch (error) {
      logger.error('Error handling bid placed event:', error);
    }
  }

  async handleAuctionEnded(auctionId, winner, winningBid, platformFee, burnedAmount, event) {
    try {
      const winAmount = ethers.formatUnits(winningBid, 18);
      const feeAmount = ethers.formatUnits(platformFee, 18);
      const burnAmount = ethers.formatUnits(burnedAmount, 18);
      
      logger.blockchain('auction_ended', {
        auctionId: auctionId.toString(),
        winner,
        winningBid: winAmount,
        platformFee: feeAmount,
        burnedAmount: burnAmount,
        transactionHash: event.transactionHash
      });
      
      // Update auction in database
      const auction = await Auction.findOneAndUpdate(
        { auctionId: auctionId.toString() },
        {
          $set: {
            status: 'ended',
            'winner.walletAddress': winner,
            'winner.winningBid': parseFloat(winAmount),
            'winner.wonAt': new Date()
          }
        },
        { new: true }
      );
      
      if (auction) {
        // Find winner user
        const winnerUser = await User.findOne({ walletAddress: winner.toLowerCase() });
        
        if (winnerUser) {
          auction.winner.userId = winnerUser._id;
          auction.winner.anonymousId = winnerUser.anonymousId;
          await auction.save();
        }
        
        // Create fee transaction records
        if (parseFloat(feeAmount) > 0) {
          const feeTransaction = new TokenTransaction({
            type: 'fee_payment',
            user: {
              userId: winnerUser?._id,
              walletAddress: winner,
              anonymousId: winnerUser?.anonymousId || 'UNKNOWN'
            },
            amount: parseFloat(feeAmount),
            blockchain: {
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
              isConfirmed: true
            },
            fees: {
              platformFee: parseFloat(feeAmount),
              burnAmount: parseFloat(burnAmount),
              treasuryAmount: parseFloat(feeAmount) - parseFloat(burnAmount)
            },
            relatedTo: {
              type: 'auction',
              id: auction.auctionId,
              reference: auction._id
            },
            status: 'confirmed'
          });
          await feeTransaction.save();
        }
        
        // Broadcast auction end
        webSocketController.broadcastAuctionEnd(auctionId.toString(), {
          winner: winnerUser?.anonymousId || winner,
          winningBid: winAmount,
          platformFee: feeAmount,
          burnedAmount: burnAmount
        });
        
        // Send notifications
        if (winnerUser) {
          await notificationService.sendNotification({
            recipient: {
              userId: winnerUser._id,
              anonymousId: winnerUser.anonymousId
            },
            type: 'auction_won',
            priority: 'high',
            title: 'Auction Won!',
            message: `Congratulations! You won "${auction.title}" for ${winAmount} WKC.`,
            data: {
              auctionId: auction.auctionId,
              winningBid: winAmount,
              transactionHash: event.transactionHash
            },
            channels: {
              inApp: { enabled: true },
              email: { enabled: true }
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error handling auction ended event:', error);
    }
  }

  async handleAuctionTokensBurned(amount, auctionId, reason, event) {
    try {
      const burnAmount = ethers.formatUnits(amount, 18);
      
      logger.blockchain('auction_tokens_burned', {
        amount: burnAmount,
        auctionId: auctionId.toString(),
        reason,
        transactionHash: event.transactionHash
      });
      
      // Update cache with new burn amount
      if (this.totalBurnedCache) {
        this.totalBurnedCache = (parseFloat(this.totalBurnedCache) + parseFloat(burnAmount)).toString();
        this.lastCacheUpdate = Date.now();
      }
      
      // Broadcast burn event
      webSocketController.broadcastTokensBurned({
        amount: burnAmount,
        reason,
        auctionId: auctionId.toString(),
        transactionHash: event.transactionHash
      });
    } catch (error) {
      logger.error('Error handling auction tokens burned event:', error);
    }
  }

  async handleEscrowCreated(escrowId, auctionId, buyer, seller, amount, event) {
    try {
      const escrowAmount = ethers.formatUnits(amount, 18);
      
      logger.blockchain('escrow_created', {
        escrowId: escrowId.toString(),
        auctionId: auctionId.toString(),
        buyer,
        seller,
        amount: escrowAmount,
        transactionHash: event.transactionHash
      });
      
      // Find users
      const [buyerUser, sellerUser] = await Promise.all([
        User.findOne({ walletAddress: buyer.toLowerCase() }),
        User.findOne({ walletAddress: seller.toLowerCase() })
      ]);
      
      // Send notifications
      if (buyerUser) {
        await notificationService.sendNotification({
          recipient: {
            userId: buyerUser._id,
            anonymousId: buyerUser.anonymousId
          },
          type: 'escrow_funded',
          priority: 'medium',
          title: 'Escrow Created',
          message: `Escrow created for ${escrowAmount} WKC. Awaiting delivery confirmation.`,
          data: {
            escrowId: escrowId.toString(),
            auctionId: auctionId.toString(),
            amount: escrowAmount
          },
          channels: {
            inApp: { enabled: true },
            email: { enabled: true }
          }
        });
      }
    } catch (error) {
      logger.error('Error handling escrow created event:', error);
    }
  }

  async handleEscrowCompleted(escrowId, amount, event) {
    try {
      const completedAmount = ethers.formatUnits(amount, 18);
      
      logger.blockchain('escrow_completed', {
        escrowId: escrowId.toString(),
        amount: completedAmount,
        transactionHash: event.transactionHash
      });
      
      // Broadcast escrow completion
      webSocketController.broadcastToAll('escrow_completed', {
        escrowId: escrowId.toString(),
        amount: completedAmount,
        transactionHash: event.transactionHash
      });
    } catch (error) {
      logger.error('Error handling escrow completed event:', error);
    }
  }

  async handleDisputeRaised(escrowId, reason, raisedBy, event) {
    try {
      logger.blockchain('dispute_raised', {
        escrowId: escrowId.toString(),
        reason,
        raisedBy,
        transactionHash: event.transactionHash
      });
      
      // Find user who raised dispute
      const user = await User.findOne({ walletAddress: raisedBy.toLowerCase() });
      
      // Broadcast dispute event
      webSocketController.broadcastToAll('dispute_raised', {
        escrowId: escrowId.toString(),
        reason,
        raisedBy: user?.anonymousId || raisedBy,
        transactionHash: event.transactionHash
      });
    } catch (error) {
      logger.error('Error handling dispute raised event:', error);
    }
  }

  // Utility methods with rate limiting and caching
  async getTotalBurned() {
    const now = Date.now();
    // Return cached value if still valid
    if (this.totalBurnedCache && (now - this.lastCacheUpdate) < this.cacheValidityMs) {
      return this.totalBurnedCache;
    }
    
    // Otherwise fetch fresh value
    try {
      await this.blockchainRateLimiter.waitForAvailability();
      
      // Try WebSocket first, fallback to HTTP
      let contract = this.wsContracts?.wkcToken || this.contracts?.wkcToken;
      
      if (!contract) {
        throw new Error('WKC contract not available');
      }
      
      const totalBurned = await contract.totalBurned();
      this.totalBurnedCache = ethers.formatUnits(totalBurned, 18);
      this.lastCacheUpdate = now;
      return this.totalBurnedCache;
    } catch (error) {
      logger.error('Error getting total burned:', error);
      return this.totalBurnedCache || '0'; // Return cached value even if stale
    }
  }

  async getCurrentBlockNumber() {
    try {
      await this.blockchainRateLimiter.waitForAvailability();
      
      // Try WebSocket first, fallback to HTTP
      if (this.wsProvider && this.isConnected) {
        return await this.wsProvider.getBlockNumber();
      }
      
      return await this.provider.getBlockNumber();
    } catch (error) {
      logger.error('Error getting current block number:', error);
      return 0;
    }
  }

  // Manual event processing (for missed events) with batching
  async processHistoricalEvents(fromBlock = 'latest', toBlock = 'latest', batchSize = 100, batchDelay = 1000) {
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      const startBlock = fromBlock === 'latest' ? currentBlock - 1000 : fromBlock;
      const endBlock = toBlock === 'latest' ? currentBlock : toBlock;
      
      logger.info(`Processing historical events from block ${startBlock} to ${endBlock}`);
      
      // Process in batches
      for (let block = startBlock; block <= endBlock; block += batchSize) {
        const batchEndBlock = Math.min(block + batchSize - 1, endBlock);
        
        logger.info(`Processing batch from block ${block} to ${batchEndBlock}`);
        
        // Process events for each contract
        if (this.contracts.wkcToken) {
          const burnEvents = await this.contracts.wkcToken.queryFilter(
            this.contracts.wkcToken.filters.TokensBurned(),
            block,
            batchEndBlock
          );
          
          for (const event of burnEvents) {
            await this.handleTokensBurned(
              event.args.amount,
              event.args.burner,
              event.args.reason,
              event
            );
          }
        }
        
        if (this.contracts.auction) {
          const bidEvents = await this.contracts.auction.queryFilter(
            this.contracts.auction.filters.BidPlaced(),
            block,
            batchEndBlock
          );
          
          for (const event of bidEvents) {
            await this.handleBidPlaced(
              event.args.auctionId,
              event.args.bidder,
              event.args.amount,
              event.args.timestamp,
              event
            );
          }
        }
        
        // Add delay between batches to avoid rate limiting
        if (batchEndBlock < endBlock) {
          logger.info(`Waiting ${batchDelay}ms before processing next batch`);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }
      
      logger.info('Historical event processing completed');
    } catch (error) {
      logger.error('Error processing historical events:', error);
      throw error;
    }
  }
}

module.exports = new BlockchainEventController();