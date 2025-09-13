// controllers/tokenTransactionController.js
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

// Record bid placement (lock tokens in escrow)
const recordBidLock = async (bidData) => {
  const { bidderId, auctionId, amount, walletAddress, anonymousId, transactionHash } = bidData;
  
  const tx = await TokenTransaction.create({
    type: 'bid_lock',
    user: {
      userId: bidderId,
      walletAddress,
      anonymousId
    },
    amount,
    status: 'confirmed',
    blockchain: {
      transactionHash,
      isConfirmed: true
    },
    relatedTo: {
      type: 'auction',
      id: auctionId
    },
    metadata: {
      description: 'Bid placement',
      source: 'web'
    }
  });
  
  return tx;
};

// Refund losing bidders (unlock tokens)
const refundBid = async (bidData) => {
  const { bidderId, auctionId, amount, walletAddress, anonymousId, bidId } = bidData;
  
  const tx = await TokenTransaction.create({
    type: 'bid_unlock',
    user: {
      userId: bidderId,
      walletAddress,
      anonymousId
    },
    amount,
    status: 'pending',
    relatedTo: {
      type: 'auction',
      id: auctionId,
      reference: bidId
    },
    metadata: {
      description: 'Bid refund',
      source: 'system'
    }
  });
  
  // Execute blockchain refund
  try {
    const refundResult = await web3Service.refundTokens(walletAddress, amount);
    
    // Update transaction with blockchain details
    tx.blockchain = {
      transactionHash: refundResult.transactionHash,
      blockNumber: refundResult.blockNumber,
      blockHash: refundResult.blockHash,
      gasUsed: refundResult.gasUsed,
      gasPrice: refundResult.gasPrice,
      confirmations: refundResult.confirmations,
      isConfirmed: true
    };
    tx.status = 'confirmed';
    await tx.save();
    
    return tx;
  } catch (error) {
    logger.error(`Refund failed for bid ${bidId}:`, error);
    tx.status = 'failed';
    await tx.save();
    throw error;
  }
};

// Transfer tokens to vendor when auction completes
const transferToVendor = async (auctionData) => {
  const { auctionId, vendorId, walletAddress, anonymousId, winningBidAmount } = auctionData;
  
  const tx = await TokenTransaction.create({
    type: 'escrow_release',
    user: {
      userId: vendorId,
      walletAddress,
      anonymousId
    },
    amount: winningBidAmount,
    status: 'pending',
    relatedTo: {
      type: 'auction',
      id: auctionId
    },
    metadata: {
      description: 'Auction payout',
      source: 'system'
    }
  });
  
  // Execute blockchain transfer
  try {
    const transferResult = await web3Service.transferTokens(walletAddress, winningBidAmount);
    
    // Update transaction with blockchain details
    tx.blockchain = {
      transactionHash: transferResult.transactionHash,
      blockNumber: transferResult.blockNumber,
      blockHash: transferResult.blockHash,
      gasUsed: transferResult.gasUsed,
      gasPrice: transferResult.gasPrice,
      confirmations: transferResult.confirmations,
      isConfirmed: true
    };
    tx.status = 'confirmed';
    await tx.save();
    
    return tx;
  } catch (error) {
    logger.error(`Vendor transfer failed for auction ${auctionId}:`, error);
    tx.status = 'failed';
    await tx.save();
    throw error;
  }
};

// Burn platform fees
const burnPlatformFees = async (feeData) => {
  const { amount, auctionId, gasUsed, gasPrice } = feeData;
  
  const tx = await TokenTransaction.create({
    type: 'fee_burn',
    amount,
    status: 'pending',
    fees: {
      platformFee: amount,
      burnAmount: amount,
      gasFee: gasUsed * parseFloat(gasPrice)
    },
    relatedTo: {
      type: 'auction',
      id: auctionId
    },
    metadata: {
      description: 'Platform fee burn',
      source: 'system'
    }
  });
  
  // Execute blockchain burn
  try {
    const burnResult = await web3Service.burnTokens(amount);
    
    // Update transaction with blockchain details
    tx.blockchain = {
      transactionHash: burnResult.transactionHash,
      blockNumber: burnResult.blockNumber,
      blockHash: burnResult.blockHash,
      gasUsed: burnResult.gasUsed,
      gasPrice: burnResult.gasPrice,
      confirmations: burnResult.confirmations,
      isConfirmed: true
    };
    tx.status = 'confirmed';
    await tx.save();
    
    return tx;
  } catch (error) {
    logger.error(`Fee burn failed for auction ${auctionId}:`, error);
    tx.status = 'failed';
    await tx.save();
    throw error;
  }
};

// Transfer to treasury
const transferToTreasury = async (treasuryData) => {
  const { amount, auctionId, gasUsed, gasPrice } = treasuryData;
  
  const tx = await TokenTransaction.create({
    type: 'fee_payment',
    amount,
    status: 'pending',
    fees: {
      platformFee: amount,
      treasuryAmount: amount,
      gasFee: gasUsed * parseFloat(gasPrice)
    },
    relatedTo: {
      type: 'auction',
      id: auctionId
    },
    metadata: {
      description: 'Treasury allocation',
      source: 'system'
    }
  });
  
  // Execute blockchain transfer
  try {
    const transferResult = await web3Service.transferToTreasury(amount);
    
    // Update transaction with blockchain details
    tx.blockchain = {
      transactionHash: transferResult.transactionHash,
      blockNumber: transferResult.blockNumber,
      blockHash: transferResult.blockHash,
      gasUsed: transferResult.gasUsed,
      gasPrice: transferResult.gasPrice,
      confirmations: transferResult.confirmations,
      isConfirmed: true
    };
    tx.status = 'confirmed';
    await tx.save();
    
    return tx;
  } catch (error) {
    logger.error(`Treasury transfer failed for auction ${auctionId}:`, error);
    tx.status = 'failed';
    await tx.save();
    throw error;
  }
};

// Get user transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    
    const filter = { 'user.userId': req.user.id };
    if (type) filter.type = type;
    if (status) filter.status = status;
    
    const transactions = await TokenTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('relatedTo.reference', 'title');
    
    const total = await TokenTransaction.countDocuments(filter);
    
    res.json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to fetch transaction history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transaction history' 
    });
  }
};

// Admin balance adjustment
const adjustBalance = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    
    // Determine transaction type
    const txType = amount >= 0 ? 'deposit' : 'withdrawal';
    
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Record adjustment transaction
    const tx = await TokenTransaction.create({
      type: txType,
      user: {
        userId: user._id,
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId
      },
      amount: Math.abs(amount),
      status: 'pending',
      metadata: {
        description: reason,
        source: 'admin',
        initiatedBy: 'admin'
      }
    });
    
    // Execute blockchain adjustment
    try {
      const adjustmentResult = await web3Service.adjustBalance(
        user.walletAddress,
        amount
      );
      
      // Update transaction with blockchain details
      tx.blockchain = {
        transactionHash: adjustmentResult.transactionHash,
        blockNumber: adjustmentResult.blockNumber,
        blockHash: adjustmentResult.blockHash,
        gasUsed: adjustmentResult.gasUsed,
        gasPrice: adjustmentResult.gasPrice,
        confirmations: adjustmentResult.confirmations,
        isConfirmed: true
      };
      tx.status = 'confirmed';
      await tx.save();
      
      res.json({
        success: true,
        message: 'Balance adjusted successfully',
        transaction: tx
      });
    } catch (error) {
      logger.error('Blockchain balance adjustment failed:', error);
      tx.status = 'failed';
      await tx.save();
      throw error;
    }
  } catch (error) {
    logger.error('Balance adjustment failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Balance adjustment failed' 
    });
  }
};

// Get user's current token balance
const getUserBalance = async (req, res) => {
  try {
    // Use the model's static method to get balance summary
    const balanceSummary = await TokenTransaction.getUserBalanceSummary(req.user.id);
    
    res.json({
      success: true,
      balance: balanceSummary,
      walletAddress: req.user.walletAddress
    });
  } catch (error) {
    logger.error('Failed to fetch user balance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch balance' 
    });
  }
};

module.exports = {
  recordBidLock,
  refundBid,
  transferToVendor,
  burnPlatformFees,
  transferToTreasury,
  getTransactionHistory,
  adjustBalance,
  getUserBalance
};