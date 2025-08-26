const { ethers, WebSocketProvider } = require('ethers');
const logger = require('../utils/logger');
const TokenTransaction = require('../models/tokenTransactionModel');
class Web3Service {
  constructor() {
    this.provider = null;
    this.wsProvider = null;
    this.wallet = null;
    this.contracts = {};
    this.wsContracts = {};
    this.eventListeners = new Map();
    this.isListening = false;
    this.tokenDecimals = 18; // Default value, will be updated during initialization
    this.initialize();
  }
  async initialize() {
    try {
      // Initialize HTTP provider for transactions
      this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      
      // Initialize WebSocket provider for events
      const wsUrl = process.env.BLOCKCHAIN_RPC_URL.replace('https://', 'wss://').replace('/v3/', '/ws/v3/');
      this.wsProvider = new WebSocketProvider(wsUrl);
      
      // Initialize wallet
      if (process.env.PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        logger.info('Web3 wallet initialized');
      }
      // Initialize contracts
      await this.initializeContracts();
      
      // Get token decimals
      if (this.contracts.wkcToken) {
        this.tokenDecimals = await this.contracts.wkcToken.decimals();
        logger.info(`Token decimals: ${this.tokenDecimals}`);
      }
      
      // Setup WebSocket event listeners
      this.setupWebSocketEventListeners();
      
      logger.info('Web3Service initialized with WebSocket support');
    } catch (error) {
      logger.error('Failed to initialize Web3Service:', error);
      throw error;
    }
  }
  async initializeContracts() {
    try {
      // WKC Token Contract ABI (simplified)
      const wkcTokenABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
        "function totalBurned() view returns (uint256)",
        "function getCirculatingSupply() view returns (uint256)",
        "function getBurnRate() view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function burn(uint256 amount, string reason)",
        "function burnFrom(address account, uint256 amount, string reason)",
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "event Approval(address indexed owner, address indexed spender, uint256 value)",
        "event TokensBurned(uint256 amount, address indexed burner, string reason)"
      ];
      // Auction Contract ABI (simplified)
      const auctionContractABI = [
        "function createAuction(string title, string description, uint256 startingBid, uint256 reservePrice, uint256 buyNowPrice, uint256 duration, bool isReverse) returns (uint256)",
        "function placeBid(uint256 auctionId, uint256 bidAmount)",
        "function buyNow(uint256 auctionId)",
        "function endAuction(uint256 auctionId)",
        "function getAuctionDetails(uint256 auctionId) view returns (address seller, string title, uint256 currentBid, uint256 endTime, address highestBidder, bool isActive, bool isReverse, uint256 totalBids)",
        "function getUserAuctions(address user) view returns (uint256[])",
        "function getUserBids(address user) view returns (uint256[])",
        "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string title, uint256 startingBid, uint256 endTime, bool isReverse)",
        "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
        "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 winningBid, uint256 platformFee, uint256 burnedAmount)",
        "event TokensBurned(uint256 amount, uint256 indexed auctionId, string reason)"
      ];
      // Escrow Contract ABI (simplified)
      const escrowContractABI = [
        "function createEscrow(uint256 auctionId, address buyer, address seller, uint256 amount, uint256 deliveryDays) returns (uint256)",
        "function fundEscrow(uint256 escrowId) payable",
        "function confirmDelivery(uint256 escrowId)",
        "function raiseDispute(uint256 escrowId, string reason)",
        "function resolveDispute(uint256 escrowId, address winner, uint256 buyerAmount, uint256 sellerAmount)",
        "function getEscrowDetails(uint256 escrowId) view returns (address buyer, address seller, uint256 amount, uint8 status, uint256 deliveryDeadline, bool buyerConfirmed, bool sellerConfirmed)",
        "event EscrowCreated(uint256 indexed escrowId, uint256 indexed auctionId, address indexed buyer, address seller, uint256 amount)",
        "event EscrowFunded(uint256 indexed escrowId)",
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
          this.wallet || this.provider
        );
        
        // WebSocket contract for events
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
          this.wallet || this.provider
        );
        
        // WebSocket contract for events
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
          this.wallet || this.provider
        );
        
        // WebSocket contract for events
        this.wsContracts.escrow = new ethers.Contract(
          process.env.ESCROW_CONTRACT_ADDRESS,
          escrowContractABI,
          this.wsProvider
        );
      }
      logger.info('Smart contracts initialized');
    } catch (error) {
      logger.error('Failed to initialize contracts:', error);
      throw error;
    }
  }
  // Enhanced token operations
  async getTokenInfo() {
    try {
      const [name, symbol, decimals, totalSupply, totalBurned, circulatingSupply, burnRate] = await Promise.all([
        this.contracts.wkcToken.name(),
        this.contracts.wkcToken.symbol(),
        this.contracts.wkcToken.decimals(),
        this.contracts.wkcToken.totalSupply(),
        this.contracts.wkcToken.totalBurned(),
        this.contracts.wkcToken.getCirculatingSupply(),
        this.contracts.wkcToken.getBurnRate()
      ]);
      return {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        totalBurned: ethers.formatUnits(totalBurned, decimals),
        circulatingSupply: ethers.formatUnits(circulatingSupply, decimals),
        burnRate: Number(burnRate) / 100 // Convert from basis points to percentage
      };
    } catch (error) {
      logger.error('Error getting token info:', error);
      throw error;
    }
  }
  // Token operations
  async getTokenBalance(walletAddress) {
    try {
      // Simulate token balance for demo
      return (Math.random() * 5000 + 1000).toFixed(2);
    } catch (error) {
      logger.error('Error getting token balance:', error);
      return (Math.random() * 5000 + 1000).toFixed(2);
    }
  }
  async transferTokens(toAddress, amount) {
    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);
      
      const tx = await this.contracts.wkcToken.transfer(toAddress, amountInWei, {
        gasLimit: process.env.GAS_LIMIT || 100000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      throw error;
    }
  }
  async approveTokenSpending(spenderAddress, amount) {
    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);
      
      const tx = await this.contracts.wkcToken.approve(spenderAddress, amountInWei, {
        gasLimit: process.env.GAS_LIMIT || 100000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error approving token spending:', error);
      throw error;
    }
  }
  async burnTokens(amount, reason) {
    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);
      
      const tx = await this.contracts.wkcToken.burn(amountInWei, reason, {
        gasLimit: process.env.GAS_LIMIT || 100000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        burnedAmount: amount
      };
    } catch (error) {
      logger.error('Error burning tokens:', error);
      throw error;
    }
  }
  // Auction operations
  async createAuctionOnChain(title, description, startingBid, reservePrice = 0, buyNowPrice = 0, duration, isReverse = false) {
    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const startingBidInWei = ethers.parseUnits(startingBid.toString(), decimals);
      const reservePriceInWei = ethers.parseUnits(reservePrice.toString(), decimals);
      const buyNowPriceInWei = buyNowPrice > 0 ? ethers.parseUnits(buyNowPrice.toString(), decimals) : 0;
      
      const tx = await this.contracts.auction.createAuction(
        title,
        description,
        startingBidInWei,
        reservePriceInWei,
        buyNowPriceInWei,
        duration,
        isReverse,
        {
          gasLimit: process.env.GAS_LIMIT || 200000,
          gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
        }
      );
      
      const receipt = await tx.wait();
      
      // Extract auction ID from events
      const auctionCreatedEvent = receipt.logs.find(
        log => log.topics[0] === ethers.id('AuctionCreated(uint256,address,string,uint256,uint256,bool)')
      );
      
      let auctionId = null;
      if (auctionCreatedEvent) {
        const decodedEvent = this.contracts.auction.interface.parseLog(auctionCreatedEvent);
        auctionId = decodedEvent.args.auctionId.toString();
      }
      
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        auctionId
      };
    } catch (error) {
      logger.error('Error creating auction on chain:', error);
      throw error;
    }
  }
  async placeBidOnChain(auctionId, bidAmount) {
    try {
      // Simulate blockchain transaction for demo
      return {
        transactionHash: `0x${require('crypto').randomBytes(32).toString('hex')}`,
        blockNumber: Math.floor(Math.random() * 1000000),
        gasUsed: Math.floor(Math.random() * 100000).toString()
      };
    } catch (error) {
      logger.error('Error placing bid on chain:', error);
      // Return simulated result even on error for demo
      return {
        transactionHash: `0x${require('crypto').randomBytes(32).toString('hex')}`,
        blockNumber: Math.floor(Math.random() * 1000000),
        gasUsed: Math.floor(Math.random() * 100000).toString()
      };
    }
  }
  async buyNowOnChain(auctionId) {
    try {
      const tx = await this.contracts.auction.buyNow(auctionId, {
        gasLimit: process.env.GAS_LIMIT || 150000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error buying now on chain:', error);
      throw error;
    }
  }
  async endAuctionOnChain(auctionId) {
    try {
      const tx = await this.contracts.auction.endAuction(auctionId, {
        gasLimit: process.env.GAS_LIMIT || 150000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error ending auction on chain:', error);
      throw error;
    }
  }
  // Escrow operations
  async createEscrowOnChain(auctionId, buyerAddress, sellerAddress, amount, deliveryDays = 7) {
    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);
      
      const tx = await this.contracts.escrow.createEscrow(
        auctionId,
        buyerAddress,
        sellerAddress,
        amountInWei,
        deliveryDays,
        {
          gasLimit: process.env.GAS_LIMIT || 200000,
          gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
        }
      );
      
      const receipt = await tx.wait();
      
      // Extract escrow ID from events
      const escrowCreatedEvent = receipt.logs.find(
        log => log.topics[0] === ethers.id('EscrowCreated(uint256,uint256,address,address,uint256)')
      );
      
      let escrowId = null;
      if (escrowCreatedEvent) {
        const decodedEvent = this.contracts.escrow.interface.parseLog(escrowCreatedEvent);
        escrowId = decodedEvent.args.escrowId.toString();
      }
      
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        escrowId
      };
    } catch (error) {
      logger.error('Error creating escrow on chain:', error);
      throw error;
    }
  }
  async fundEscrowOnChain(escrowId) {
    try {
      const tx = await this.contracts.escrow.fundEscrow(escrowId, {
        gasLimit: process.env.GAS_LIMIT || 150000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error funding escrow on chain:', error);
      throw error;
    }
  }
  async confirmDeliveryOnChain(escrowId) {
    try {
      const tx = await this.contracts.escrow.confirmDelivery(escrowId, {
        gasLimit: process.env.GAS_LIMIT || 150000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error confirming delivery on chain:', error);
      throw error;
    }
  }
  async raiseDisputeOnChain(escrowId, reason) {
    try {
      const tx = await this.contracts.escrow.raiseDispute(escrowId, reason, {
        gasLimit: process.env.GAS_LIMIT || 150000,
        gasPrice: process.env.GAS_PRICE || ethers.parseUnits('20', 'gwei')
      });
      
      const receipt = await tx.wait();
      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Error raising dispute on chain:', error);
      throw error;
    }
  }
  // Utility functions
  async getTransactionReceipt(transactionHash) {
    try {
      return await this.provider.getTransactionReceipt(transactionHash);
    } catch (error) {
      logger.error('Error getting transaction receipt:', error);
      throw error;
    }
  }
  async getCurrentBlockNumber() {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      logger.error('Error getting current block number:', error);
      throw error;
    }
  }
  async estimateGas(contract, method, params) {
    try {
      return await contract[method].estimateGas(...params);
    } catch (error) {
      logger.error('Error estimating gas:', error);
      throw error;
    }
  }
  // WebSocket Event listeners (no polling!)
  setupWebSocketEventListeners() {
    if (this.isListening) {
      logger.warn('Event listeners already active');
      return;
    }
    
    try {
      // Token events
      if (this.wsContracts.wkcToken) {
        this.wsContracts.wkcToken.on('TokensBurned', (amount, burner, reason, event) => {
          logger.blockchain('tokens_burned', {
            amount: ethers.formatUnits(amount, this.tokenDecimals),
            burner,
            reason,
            transactionHash: event.transactionHash
          });
          this.handleTokensBurned(amount, burner, reason, event);
        });
        
        this.wsContracts.wkcToken.on('Transfer', (from, to, value, event) => {
          // Only log significant transfers to avoid spam
          const transferAmount = parseFloat(ethers.formatUnits(value, this.tokenDecimals));
          if (transferAmount > 1000) {
            logger.blockchain('large_transfer', {
              from,
              to,
              amount: transferAmount,
              transactionHash: event.transactionHash
            });
          }
        });
      }
      // Listen for auction events
      if (this.wsContracts.auction) {
        this.wsContracts.auction.on('AuctionCreated', (auctionId, seller, title, startingBid, endTime, isReverse, event) => {
          logger.blockchain('auction_created', {
            auctionId: auctionId.toString(),
            seller,
            title,
            startingBid: ethers.formatUnits(startingBid, this.tokenDecimals),
            isReverse
          });
          this.handleAuctionCreated(auctionId, seller, title, startingBid, endTime, isReverse, event);
        });
        this.wsContracts.auction.on('BidPlaced', (auctionId, bidder, amount, event) => {
          logger.blockchain('bid_placed', {
            auctionId: auctionId.toString(),
            bidder,
            amount: ethers.formatUnits(amount, this.tokenDecimals)
          });
          this.handleBidPlaced(auctionId, bidder, amount, event);
        });
        this.wsContracts.auction.on('AuctionEnded', (auctionId, winner, winningBid, platformFee, burnedAmount, event) => {
          logger.blockchain('auction_ended', {
            auctionId: auctionId.toString(),
            winner,
            winningBid: ethers.formatUnits(winningBid, this.tokenDecimals),
            platformFee: ethers.formatUnits(platformFee, this.tokenDecimals),
            burnedAmount: ethers.formatUnits(burnedAmount, this.tokenDecimals)
          });
          this.handleAuctionEnded(auctionId, winner, winningBid, platformFee, burnedAmount, event);
        });
        this.wsContracts.auction.on('TokensBurned', (amount, auctionId, reason, event) => {
          logger.blockchain('auction_tokens_burned', {
            amount: ethers.formatUnits(amount, this.tokenDecimals),
            auctionId: auctionId.toString(),
            reason
          });
          this.handleAuctionTokensBurned(amount, auctionId, reason, event);
        });
      }
      // Listen for escrow events
      if (this.wsContracts.escrow) {
        this.wsContracts.escrow.on('EscrowCreated', (escrowId, auctionId, buyer, seller, amount, event) => {
          logger.blockchain('escrow_created', {
            escrowId: escrowId.toString(),
            auctionId: auctionId.toString(),
            buyer,
            seller,
            amount: ethers.formatUnits(amount, this.tokenDecimals)
          });
          this.handleEscrowCreated(escrowId, auctionId, buyer, seller, amount, event);
        });
        this.wsContracts.escrow.on('EscrowCompleted', (escrowId, amount, event) => {
          logger.blockchain('escrow_completed', {
            escrowId: escrowId.toString(),
            amount: ethers.formatUnits(amount, this.tokenDecimals)
          });
          this.handleEscrowCompleted(escrowId, amount, event);
        });
        this.wsContracts.escrow.on('DisputeRaised', (escrowId, reason, raisedBy, event) => {
          logger.blockchain('dispute_raised', {
            escrowId: escrowId.toString(),
            reason,
            raisedBy
          });
          this.handleDisputeRaised(escrowId, reason, raisedBy, event);
        });
      }
      // Handle WebSocket connection events
      this.wsProvider._websocket.on("open", () => {
        logger.info("WebSocket connected");
        this.isListening = true;
      });
      
      this.wsProvider._websocket.on("close", (code) => {
        logger.warn("WebSocket closed:", code);
        this.isListening = false;
        // Attempt reconnection after delay
        setTimeout(() => this.reconnectWebSocket(), 5000);
      });
      
      this.wsProvider._websocket.on("error", (error) => {
        logger.error('WebSocket provider error:', error);
      });
      
      this.isListening = true;
      logger.info('WebSocket event listeners set up successfully');
    } catch (error) {
      logger.error('Error setting up event listeners:', error);
    }
  }
  
  // Reconnection logic for WebSocket
  async reconnectWebSocket() {
    if (this.isListening) return;
    
    try {
      logger.info('Attempting WebSocket reconnection...');
      
      // Recreate WebSocket provider
      const wsUrl = process.env.BLOCKCHAIN_RPC_URL.replace('https://', 'wss://').replace('/v3/', '/ws/v3/');
      this.wsProvider = new WebSocketProvider(wsUrl);
      
      // Reinitialize WebSocket contracts
      await this.initializeWebSocketContracts();
      
      // Setup listeners again
      this.setupWebSocketEventListeners();
      
      logger.info('WebSocket reconnection successful');
    } catch (error) {
      logger.error('WebSocket reconnection failed:', error);
      // Retry after longer delay
      setTimeout(() => this.reconnectWebSocket(), 15000);
    }
  }
  
  async initializeWebSocketContracts() {
    const wkcTokenABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event TokensBurned(uint256 amount, address indexed burner, string reason)"
    ];
    const auctionContractABI = [
      "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string title, uint256 startingBid, uint256 endTime, bool isReverse)",
      "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
      "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 winningBid, uint256 platformFee, uint256 burnedAmount)",
      "event TokensBurned(uint256 amount, uint256 indexed auctionId, string reason)"
    ];
    const escrowContractABI = [
      "event EscrowCreated(uint256 indexed escrowId, uint256 indexed auctionId, address indexed buyer, address seller, uint256 amount)",
      "event EscrowCompleted(uint256 indexed escrowId, uint256 amount)",
      "event DisputeRaised(uint256 indexed escrowId, string reason, address raisedBy)"
    ];
    if (process.env.WKC_CONTRACT_ADDRESS) {
      this.wsContracts.wkcToken = new ethers.Contract(
        process.env.WKC_CONTRACT_ADDRESS,
        wkcTokenABI,
        this.wsProvider
      );
    }
    if (process.env.AUCTION_CONTRACT_ADDRESS) {
      this.wsContracts.auction = new ethers.Contract(
        process.env.AUCTION_CONTRACT_ADDRESS,
        auctionContractABI,
        this.wsProvider
      );
    }
    if (process.env.ESCROW_CONTRACT_ADDRESS) {
      this.wsContracts.escrow = new ethers.Contract(
        process.env.ESCROW_CONTRACT_ADDRESS,
        escrowContractABI,
        this.wsProvider
      );
    }
  }
  // Event handlers (to be implemented based on business logic)
  async handleTokensBurned(amount, burner, reason, event) {
    try {
      // Create burn transaction record
      const burnTransaction = new TokenTransaction({
        type: 'fee_burn',
        user: {
          userId: null, // System burn
          walletAddress: burner,
          anonymousId: 'SYSTEM_BURN'
        },
        amount: parseFloat(ethers.formatUnits(amount, this.tokenDecimals)),
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
    } catch (error) {
      logger.error('Error handling tokens burned event:', error);
    }
  }
  async handleAuctionCreated(auctionId, seller, title, startingBid, endTime, isReverse, event) {
    try {
      // Update database auction with blockchain info
      const Auction = require('../models/auctionModel');
      await Auction.findOneAndUpdate(
        { 'seller.walletAddress': seller.toLowerCase(), status: 'pending' },
        {
          $set: {
            'blockchain.contractAddress': this.contracts.auction.address,
            'blockchain.transactionHash': event.transactionHash,
            'blockchain.blockNumber': event.blockNumber,
            'blockchain.isOnChain': true,
            status: 'active'
          }
        }
      );
    } catch (error) {
      logger.error('Error handling auction created event:', error);
    }
  }
  async handleBidPlaced(auctionId, bidder, amount, event) {
    try {
      // Update bid status in database
      const Bid = require('../models/bidModel');
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
      // Broadcast via WebSocket
      const { socketService } = require('./socketService');
      if (socketService) {
        socketService.broadcastBidUpdate(auctionId.toString(), {
          bidder: bidder,
          amount: ethers.formatUnits(amount, this.tokenDecimals),
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Error handling bid placed event:', error);
    }
  }
  async handleAuctionEnded(auctionId, winner, winningBid, platformFee, burnedAmount, event) {
    try {
      // Update auction in database
      const Auction = require('../models/auctionModel');
      const auction = await Auction.findOne({ auctionId: auctionId.toString() });
      
      if (auction) {
        auction.status = 'ended';
        if (winner !== ethers.ZeroAddress) {
          auction.winner = {
            walletAddress: winner,
            winningBid: parseFloat(ethers.formatUnits(winningBid, this.tokenDecimals)),
            wonAt: new Date()
          };
        }
        await auction.save();
        // Create fee transaction records
        if (platformFee > 0) {
          const feeTransaction = new TokenTransaction({
            type: 'fee_payment',
            user: {
              userId: null,
              walletAddress: winner,
              anonymousId: 'PLATFORM_FEE'
            },
            amount: parseFloat(ethers.formatUnits(platformFee, this.tokenDecimals)),
            blockchain: {
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
              isConfirmed: true
            },
            fees: {
              platformFee: parseFloat(ethers.formatUnits(platformFee, this.tokenDecimals)),
              burnAmount: parseFloat(ethers.formatUnits(burnedAmount, this.tokenDecimals)),
              treasuryAmount: parseFloat(ethers.formatUnits(platformFee, this.tokenDecimals)) - parseFloat(ethers.formatUnits(burnedAmount, this.tokenDecimals))
            },
            status: 'confirmed'
          });
          await feeTransaction.save();
        }
      }
    } catch (error) {
      logger.error('Error handling auction ended event:', error);
    }
  }
  async handleAuctionTokensBurned(amount, auctionId, reason, event) {
    try {
      // This is already handled in the main TokensBurned event
      // But we can add auction-specific logic here
      logger.info(`Tokens burned for auction ${auctionId}: ${ethers.formatUnits(amount, this.tokenDecimals)} WKC`);
    } catch (error) {
      logger.error('Error handling auction tokens burned event:', error);
    }
  }
  async handleEscrowCreated(escrowId, auctionId, buyer, seller, amount, event) {
    try {
      // Create escrow record in database
      const EscrowSchema = require('mongoose').Schema({
        escrowId: String,
        auctionId: String,
        buyer: { walletAddress: String },
        seller: { walletAddress: String },
        amount: Number,
        status: String,
        blockchain: {
          transactionHash: String,
          blockNumber: Number,
          isOnChain: Boolean
        }
      }, { timestamps: true });
      
      const Escrow = require('mongoose').model('Escrow', EscrowSchema);
      
      const escrow = new Escrow({
        escrowId: escrowId.toString(),
        auctionId: auctionId.toString(),
        buyer: { walletAddress: buyer },
        seller: { walletAddress: seller },
        amount: parseFloat(ethers.formatUnits(amount, this.tokenDecimals)),
        status: 'created',
        blockchain: {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          isOnChain: true
        }
      });
      
      await escrow.save();
    } catch (error) {
      logger.error('Error handling escrow created event:', error);
    }
  }
  async handleEscrowCompleted(escrowId, amount, event) {
    try {
      // Update escrow status in database
      const Escrow = require('mongoose').model('Escrow');
      await Escrow.findOneAndUpdate(
        { escrowId: escrowId.toString() },
        {
          $set: {
            status: 'completed',
            'blockchain.transactionHash': event.transactionHash,
            'blockchain.blockNumber': event.blockNumber
          }
        }
      );
    } catch (error) {
      logger.error('Error handling escrow completed event:', error);
    }
  }
  async handleDisputeRaised(escrowId, reason, raisedBy, event) {
    try {
      // Update escrow status and create dispute record
      const Escrow = require('mongoose').model('Escrow');
      await Escrow.findOneAndUpdate(
        { escrowId: escrowId.toString() },
        {
          $set: {
            status: 'disputed',
            'dispute.isDisputed': true,
            'dispute.reason': reason,
            'dispute.filedAt': new Date()
          }
        }
      );
    } catch (error) {
      logger.error('Error handling dispute raised event:', error);
    }
  }
  // Platform statistics
  async getPlatformStats() {
    try {
      const tokenInfo = await this.getTokenInfo();
      const currentBlock = await this.provider.getBlockNumber();
      
      return {
        blockchain: {
          currentBlock,
          networkId: await this.provider.getNetwork().then(n => n.chainId),
          wsConnected: this.isListening
        },
        token: tokenInfo,
        contracts: {
          wkcToken: process.env.WKC_CONTRACT_ADDRESS,
          auction: process.env.AUCTION_CONTRACT_ADDRESS,
          escrow: process.env.ESCROW_CONTRACT_ADDRESS
        }
      };
    } catch (error) {
      logger.error('Error getting platform stats:', error);
      throw error;
    }
  }
  
  // Cleanup method
  async cleanup() {
    try {
      // Remove all WebSocket listeners
      if (this.wsContracts.wkcToken) {
        this.wsContracts.wkcToken.removeAllListeners();
      }
      if (this.wsContracts.auction) {
        this.wsContracts.auction.removeAllListeners();
      }
      if (this.wsContracts.escrow) {
        this.wsContracts.escrow.removeAllListeners();
      }
      
      // Close WebSocket connection
      if (this.wsProvider && this.wsProvider._websocket) {
        await this.wsProvider._websocket.close();
      }
      
      this.isListening = false;
      logger.info('Web3Service cleanup completed');
    } catch (error) {
      logger.error('Error during Web3Service cleanup:', error);
    }
  }
}
module.exports = new Web3Service();