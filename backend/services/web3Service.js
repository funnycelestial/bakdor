// services/web3Service.js
const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { wkcToken, auction, escrow } = require('../utils/abi');

class Web3Service {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contracts = {};
    this.tokenDecimals = 18;
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize HTTP provider for transactions and queries
      this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      logger.info('HTTP provider initialized');
      
      // Initialize wallet if available
      if (process.env.PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        logger.info('Web3 wallet initialized');
      }
      
      // Initialize contracts with FULL ABI for transactions
      await this.initializeContracts();
      
      // Get token decimals
      if (this.contracts.wkcToken) {
        this.tokenDecimals = await this.contracts.wkcToken.decimals();
        logger.info(`Token decimals: ${this.tokenDecimals}`);
      }
      
      logger.info('Web3Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Web3Service:', error);
      throw error;
    }
  }

  async initializeContracts() {
    try {
      // Initialize contract instances with FULL ABI for HTTP operations
      if (process.env.WKC_CONTRACT_ADDRESS) {
        this.contracts.wkcToken = new ethers.Contract(
          process.env.WKC_CONTRACT_ADDRESS,
          wkcToken.full, // Using full ABI
          this.wallet || this.provider
        );
      }
      
      if (process.env.AUCTION_CONTRACT_ADDRESS) {
        this.contracts.auction = new ethers.Contract(
          process.env.AUCTION_CONTRACT_ADDRESS,
          auction.full, // Using full ABI
          this.wallet || this.provider
        );
      }
      
      if (process.env.ESCROW_CONTRACT_ADDRESS) {
        this.contracts.escrow = new ethers.Contract(
          process.env.ESCROW_CONTRACT_ADDRESS,
          escrow.full, // Using full ABI
          this.wallet || this.provider
        );
      }
      
      logger.info('Smart contracts initialized with full ABI');
    } catch (error) {
      logger.error('Failed to initialize contracts:', error);
      throw error;
    }
  }

  // === TOKEN OPERATIONS ===
  async getTokenBalance(walletAddress) {
    try {
      if (!this.contracts.wkcToken) {
        throw new Error('WKC token contract not available');
      }
      
      const balance = await this.contracts.wkcToken.balanceOf(walletAddress);
      return ethers.formatUnits(balance, this.tokenDecimals);
    } catch (error) {
      logger.error('Error getting token balance:', error);
      throw error;
    }
  }

  async transferTokens(toAddress, amount) {
    try {
      if (!this.contracts.wkcToken) {
        throw new Error('WKC token contract not available');
      }
      
      const amountInWei = ethers.parseUnits(amount.toString(), this.tokenDecimals);
      
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
      if (!this.contracts.wkcToken) {
        throw new Error('WKC token contract not available');
      }
      
      const amountInWei = ethers.parseUnits(amount.toString(), this.tokenDecimals);
      
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
      if (!this.contracts.wkcToken) {
        throw new Error('WKC token contract not available');
      }
      
      const amountInWei = ethers.parseUnits(amount.toString(), this.tokenDecimals);
      
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

  // === AUCTION OPERATIONS ===
  async createAuctionOnChain(title, description, startingBid, reservePrice = 0, buyNowPrice = 0, duration, isReverse = false) {
    try {
      if (!this.contracts.auction) {
        throw new Error('Auction contract not available');
      }
      
      const startingBidInWei = ethers.parseUnits(startingBid.toString(), this.tokenDecimals);
      const reservePriceInWei = ethers.parseUnits(reservePrice.toString(), this.tokenDecimals);
      const buyNowPriceInWei = buyNowPrice > 0 ? ethers.parseUnits(buyNowPrice.toString(), this.tokenDecimals) : 0;
      
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
      if (!this.contracts.auction) {
        throw new Error('Auction contract not available');
      }
      
      const amountInWei = ethers.parseUnits(bidAmount.toString(), this.tokenDecimals);
      
      const tx = await this.contracts.auction.placeBid(auctionId, amountInWei, {
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
      logger.error('Error placing bid on chain:', error);
      throw error;
    }
  }

  async endAuctionOnChain(auctionId) {
    try {
      if (!this.contracts.auction) {
        throw new Error('Auction contract not available');
      }
      
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

  // === ESCROW OPERATIONS ===
  async createEscrowOnChain(auctionId, buyerAddress, sellerAddress, amount, deliveryDays = 7) {
    try {
      if (!this.contracts.escrow) {
        throw new Error('Escrow contract not available');
      }
      
      const amountInWei = ethers.parseUnits(amount.toString(), this.tokenDecimals);
      
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
      if (!this.contracts.escrow) {
        throw new Error('Escrow contract not available');
      }
      
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
      if (!this.contracts.escrow) {
        throw new Error('Escrow contract not available');
      }
      
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

  // === UTILITY METHODS ===
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

  // === CLEANUP ===
  async cleanup() {
    try {
      this.provider = null;
      this.wallet = null;
      this.contracts = {};
      logger.info('Web3Service cleanup completed');
    } catch (error) {
      logger.error('Error during Web3Service cleanup:', error);
    }
  }
}

// Create instance and export
const web3Service = new Web3Service();
module.exports = web3Service;