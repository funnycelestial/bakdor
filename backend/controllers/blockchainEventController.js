// controllers/blockchainEventController.js
const { ethers } = require('ethers');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');
const webSocketController = require('./webSocketController');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

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
  }

  async initialize() {
    try {
      // Initialize HTTP provider for queries
      this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      
      // Initialize WebSocket provider for events
      const wsUrl = process.env.BLOCKCHAIN_RPC_URL.replace('https://', 'wss://').replace('/v3/', '/ws/v3/');
      this.wsProvider = new ethers.WebSocketProvider(wsUrl);
      
      // Initialize contracts
      await this.initializeContracts();
      
      // Start listening to events
      this.startWebSocketEventListening();
      
      logger.info('Blockchain event controller initialized with WebSocket');
    } catch (error) {
      logger.error('Failed to initialize blockchain event controller:', error);
      throw error;
    }
  }

  async initializeContracts() {
    // WKC Token Contract ABI
    const wkcTokenABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event TokensBurned(uint256 amount, address indexed burner, string reason)",
      "function totalSupply() view returns (uint256)",
      "function totalBurned() view returns (uint256)",
      "function getCirculatingSupply() view returns (uint256)",
      "function getBurnRate() view returns (uint256)"
    ];

    // Auction Contract ABI
    const auctionContractABI = [
      "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string title, uint256 startingBid, uint256 endTime, bool isReverse)",
      "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 timestamp)",
      "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 winningBid, uint256 platformFee, uint256 burnedAmount)",
      "event TokensBurned(uint256 amount, uint256 indexed auctionId, string reason)"
    ];

    // Escrow Contract ABI
    const escrowContractABI = [
      "event EscrowCreated(uint256 indexed escrowId, uint256 indexed auctionId, address indexed buyer, address seller, uint256 amount)",
      "event EscrowFunded(uint256 indexed escrowId, uint256 amount)",
      "event DeliveryConfirmed(uint256 indexed escrowId, address confirmedBy)",
      "event EscrowCompleted(uint256 indexed escrowId, uint256 amount)",
      "event DisputeRaised(uint256 indexed escrowId, string reason, address raisedBy)",
      "event DisputeResolved(uint256 indexed escrowId, address winner, uint256 amount)"
    ];

    // Initialize contract instances
    if (process.env.WKC_CONTRACT_ADDRESS) {
      this.contracts.wkcToken = new ethers.Contract(
        process.env.WKC_CONTRACT_ADDRESS,
        wkcTokenABI,
        this.provider
      );
      
      this.wsContracts.wkcToken = new ethers.Contract(
        process.env.WKC_CONTRACT_ADDRESS,
        wkcTokenABI,
        this.wsProvider
      );
    }

    if (process.env.AUCTION_CONTRACT_ADDRESS) {
      this.contracts.auction = new ethers.Contract(
        process.env.AUCTION_CONTRACT_ADDRESS,
        auctionContractABI,
        this.provider
      );
      
      this.wsContracts.auction = new ethers.Contract(
        process.env.AUCTION_CONTRACT_ADDRESS,
        auctionContractABI,
        this.wsProvider
      );
    }

    if (process.env.ESCROW_CONTRACT_ADDRESS) {
      this.contracts.escrow = new ethers.Contract(
        process.env.ESCROW_CONTRACT_ADDRESS,
        escrowContractABI,
        this.provider
      );
      
      this.wsContracts.escrow = new ethers.Contract(
        process.env.ESCROW_CONTRACT_ADDRESS,
        escrowContractABI,
        this.wsProvider
      );
    }

    logger.info('Blockchain contracts initialized');
  }

  startWebSocketEventListening() {
    if (this.isListening) return;

    try {
      // Setup WebSocket connection handlers
      this.wsProvider.on('connect', () => {
        logger.info('Blockchain WebSocket connected');
        this.isListening = true;
        this.reconnectAttempts = 0;
      });
      
      this.wsProvider.on('disconnect', (error) => {
        logger.warn('Blockchain WebSocket disconnected:', error);
        this.isListening = false;
        this.attemptReconnection();
      });
      
      this.wsProvider.on('error', (error) => {
        logger.error('Blockchain WebSocket error:', error);
        this.attemptReconnection();
      });
      
      // Listen for token events
      if (this.wsContracts.wkcToken) {
        this.wsContracts.wkcToken.on('TokensBurned', (amount, burner, reason, event) => {
          this.handleTokensBurned(amount, burner, reason, event);
        });

        this.wsContracts.wkcToken.on('Transfer', (from, to, value, event) => {
          this.handleTokenTransfer(from, to, value, event);
        });
      }

      // Listen for auction events
      if (this.wsContracts.auction) {
        this.wsContracts.auction.on('AuctionCreated', (auctionId, seller, title, startingBid, endTime, isReverse, event) => {
          this.handleAuctionCreated(auctionId, seller, title, startingBid, endTime, isReverse, event);
        });

        this.wsContracts.auction.on('BidPlaced', (auctionId, bidder, amount, timestamp, event) => {
          this.handleBidPlaced(auctionId, bidder, amount, timestamp, event);
        });

        this.wsContracts.auction.on('AuctionEnded', (auctionId, winner, winningBid, platformFee, burnedAmount, event) => {
          this.handleAuctionEnded(auctionId, winner, winningBid, platformFee, burnedAmount, event);
        });

        this.wsContracts.auction.on('TokensBurned', (amount, auctionId, reason, event) => {
          this.handleAuctionTokensBurned(amount, auctionId, reason, event);
        });
      }

      // Listen for escrow events
      if (this.wsContracts.escrow) {
        this.wsContracts.escrow.on('EscrowCreated', (escrowId, auctionId, buyer, seller, amount, event) => {
          this.handleEscrowCreated(escrowId, auctionId, buyer, seller, amount, event);
        });

        this.wsContracts.escrow.on('EscrowCompleted', (escrowId, amount, event) => {
          this.handleEscrowCompleted(escrowId, amount, event);
        });

        this.wsContracts.escrow.on('DisputeRaised', (escrowId, reason, raisedBy, event) => {
          this.handleDisputeRaised(escrowId, reason, raisedBy, event);
        });
      }

      this.isListening = true;
      logger.info('WebSocket blockchain event listening started');
    } catch (error) {
      logger.error('Error starting event listeners:', error);
    }
  }

  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    logger.info(`WebSocket reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        logger.error('WebSocket reconnection failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  stopEventListening() {
    try {
      // Remove all listeners
      Object.values(this.wsContracts).forEach(contract => {
        contract.removeAllListeners();
      });
      
      // Close WebSocket connection
      if (this.wsProvider) {
        this.wsProvider.destroy();
      }

      this.isListening = false;
      logger.info('WebSocket blockchain event listening stopped');
    } catch (error) {
      logger.error('Error stopping event listeners:', error);
    }
  }

  // Event Handlers
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
        totalBurned: await this.getTotalBurned()
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

  // Utility methods
  async getTotalBurned() {
    try {
      if (this.contracts.wkcToken) {
        const totalBurned = await this.contracts.wkcToken.totalBurned();
        return ethers.formatUnits(totalBurned, 18);
      }
      return '0';
    } catch (error) {
      logger.error('Error getting total burned:', error);
      return '0';
    }
  }

  async getCurrentBlockNumber() {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      logger.error('Error getting current block number:', error);
      return 0;
    }
  }

  // Manual event processing (for missed events)
  async processHistoricalEvents(fromBlock = 'latest', toBlock = 'latest') {
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      const startBlock = fromBlock === 'latest' ? currentBlock - 1000 : fromBlock;
      const endBlock = toBlock === 'latest' ? currentBlock : toBlock;

      logger.info(`Processing historical events from block ${startBlock} to ${endBlock}`);

      // Process events for each contract
      if (this.contracts.wkcToken) {
        const burnEvents = await this.contracts.wkcToken.queryFilter(
          this.contracts.wkcToken.filters.TokensBurned(),
          startBlock,
          endBlock
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
          startBlock,
          endBlock
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

      logger.info('Historical event processing completed');
    } catch (error) {
      logger.error('Error processing historical events:', error);
      throw error;
    }
  }
}

module.exports = new BlockchainEventController();