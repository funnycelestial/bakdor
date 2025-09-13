const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const web3Service = require('../services/web3Service');
const logger = require('../utils/logger');

/**
 * Get user wallet balance information
 * @param {string} walletAddress - User's wallet address
 * @param {string} userId - User's ID
 * @returns {Object} - Balance information including blockchain balance, available balance, and pending transactions
 */
const getWalletBalance = async (walletAddress, userId) => {
  try {
    // Get actual blockchain balance
    const blockchainBalance = await web3Service.getBalance(walletAddress);
    
    // Get balance summary from transactions
    const balanceSummary = await TokenTransaction.getUserBalanceSummary(userId);
    
    // Get pending transactions
    const pendingTransactions = await TokenTransaction.find({
      'user.userId': userId,
      status: 'pending'
    }).select('type amount createdAt');
    
    logger.user('balance_checked', userId, {
      blockchainBalance,
      calculatedBalance: balanceSummary
    });
    
    return {
      balance: {
        available: balanceSummary.available,
        locked: balanceSummary.locked,
        total: balanceSummary.total,
        blockchain: parseFloat(blockchainBalance)
      },
      pendingTransactions
    };
  } catch (error) {
    logger.error('Error getting wallet balance:', error);
    throw new Error('Failed to retrieve balance');
  }
};

/**
 * Get user transaction history with pagination and filtering
 * @param {string} userId - User's ID
 * @param {Object} filters - Filter options including type, page, and limit
 * @returns {Object} - Transaction history with pagination info
 */
const getTransactionHistory = async (userId, filters) => {
  const { type, page = 1, limit = 50 } = filters;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = { 'user.userId': userId };
  if (type) query.type = type;
  
  const [transactions, total] = await Promise.all([
    TokenTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-user.walletAddress -blockchain.blockHash'),
    TokenTransaction.countDocuments(query)
  ]);
  
  return {
    transactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

/**
 * Process a token deposit from MetaMask
 * @param {Object} depositData - Deposit information including amount and transaction hash
 * @param {Object} userInfo - User information including wallet address and user ID
 * @param {Object} metadata - Request metadata like IP and user agent
 * @returns {Object} - Created transaction record
 */
const processDeposit = async (depositData, userInfo, metadata) => {
  const { amount, transactionHash } = depositData;
  const { walletAddress, userId, anonymousId } = userInfo;
  
  try {
    // Verify the transaction on blockchain
    const isValid = await web3Service.verifyTransaction(
      transactionHash,
      walletAddress,
      process.env.PLATFORM_WALLET_ADDRESS,
      amount
    );
    
    if (!isValid) {
      throw new Error('Invalid transaction');
    }
    
    // Check if transaction already processed
    const existingTransaction = await TokenTransaction.findOne({
      'blockchain.transactionHash': transactionHash
    });
    
    if (existingTransaction) {
      throw new Error('Transaction already processed');
    }
    
    // Create deposit transaction record
    const transaction = new TokenTransaction({
      type: 'deposit',
      user: {
        userId,
        walletAddress,
        anonymousId
      },
      amount,
      blockchain: {
        transactionHash,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        source: 'metamask',
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
        initiatedBy: 'user'
      }
    });
    
    await transaction.save();
    
    logger.payment('deposit_completed', amount, 'WKC', {
      userId,
      transactionHash
    });
    
    return {
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt
      }
    };
  } catch (error) {
    logger.error('Deposit verification failed:', error);
    throw error;
  }
};

/**
 * Process a token withdrawal to external wallet
 * @param {Object} withdrawalData - Withdrawal information including amount and recipient address
 * @param {Object} userInfo - User information including wallet address and user ID
 * @param {Object} metadata - Request metadata like IP and user agent
 * @returns {Object} - Created transaction record
 */
const processWithdrawal = async (withdrawalData, userInfo, metadata) => {
  const { amount, recipientAddress } = withdrawalData;
  const { walletAddress, userId, anonymousId } = userInfo;
  
  // Check available balance
  const balanceSummary = await TokenTransaction.getUserBalanceSummary(userId);
  
  if (balanceSummary.available < amount) {
    throw new Error('Insufficient available balance');
  }
  
  try {
    // Transfer tokens from platform wallet to external wallet
    const transferResult = await web3Service.transferFromPlatform(
      recipientAddress,
      amount,
      userId
    );
    
    // Create withdrawal transaction
    const transaction = new TokenTransaction({
      type: 'withdrawal',
      user: {
        userId,
        walletAddress,
        anonymousId
      },
      amount,
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        source: 'metamask',
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
        initiatedBy: 'user',
        recipientAddress
      }
    });
    
    await transaction.save();
    
    logger.payment('withdrawal_completed', amount, 'WKC', {
      userId,
      recipientAddress,
      transactionHash: transferResult.transactionHash
    });
    
    return {
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        transactionHash: transferResult.transactionHash,
        createdAt: transaction.createdAt
      }
    };
  } catch (blockchainError) {
    logger.error('Blockchain withdrawal failed:', blockchainError);
    throw new Error('Failed to process withdrawal on blockchain');
  }
};

/**
 * Process a token transfer to another user on platform
 * @param {Object} transferData - Transfer information including recipient address, amount, and note
 * @param {Object} userInfo - User information including wallet address and user ID
 * @param {Object} metadata - Request metadata like IP and user agent
 * @returns {Object} - Transfer result with transaction hash and recipient info
 */
const processTransfer = async (transferData, userInfo, metadata) => {
  const { recipientAddress, amount, note } = transferData;
  const { walletAddress, userId, anonymousId } = userInfo;
  
  // Check if recipient exists
  const recipient = await User.findByWallet(recipientAddress);
  if (!recipient) {
    throw new Error('Recipient wallet not found');
  }
  
  // Check available balance
  const balanceSummary = await TokenTransaction.getUserBalanceSummary(userId);
  
  if (balanceSummary.available < amount) {
    throw new Error('Insufficient available balance');
  }
  
  try {
    // Transfer tokens on blockchain (platform internal transfer)
    const transferResult = await web3Service.internalTransfer(
      walletAddress,
      recipientAddress,
      amount
    );
    
    // Create transaction records for both sender and recipient
    const senderTransaction = new TokenTransaction({
      type: 'transfer',
      user: {
        userId,
        walletAddress,
        anonymousId
      },
      amount: -amount, // Negative for sender
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        description: note || 'Token transfer',
        source: 'metamask',
        initiatedBy: 'user',
        recipientAddress
      }
    });
    
    const recipientTransaction = new TokenTransaction({
      type: 'transfer',
      user: {
        userId: recipient._id,
        walletAddress: recipient.walletAddress,
        anonymousId: recipient.anonymousId
      },
      amount: amount, // Positive for recipient
      blockchain: {
        transactionHash: transferResult.transactionHash,
        blockNumber: transferResult.blockNumber,
        gasUsed: transferResult.gasUsed,
        isConfirmed: true
      },
      status: 'confirmed',
      metadata: {
        description: note || 'Token transfer received',
        source: 'metamask',
        initiatedBy: 'user',
        senderAddress: walletAddress
      }
    });
    
    await Promise.all([
      senderTransaction.save(),
      recipientTransaction.save()
    ]);
    
    logger.payment('transfer_completed', amount, 'WKC', {
      senderId: userId,
      recipientId: recipient._id,
      transactionHash: transferResult.transactionHash
    });
    
    return {
      transaction: {
        transactionHash: transferResult.transactionHash,
        amount,
        recipient: recipient.anonymousId,
        note
      }
    };
  } catch (blockchainError) {
    logger.error('Blockchain transfer failed:', blockchainError);
    throw new Error('Failed to transfer tokens on blockchain');
  }
};

/**
 * Get available payment methods (MetaMask only)
 * @returns {Object} - Available payment methods
 */
const getPaymentMethods = () => {
  return {
    paymentMethods: [
      {
        id: 'metamask',
        name: 'MetaMask',
        type: 'crypto_wallet',
        status: 'active',
        fees: 'Network fees apply',
        processingTime: 'Blockchain confirmation time',
        supportedTokens: ['WKC', 'ETH', 'USDT'],
        description: 'Connect your MetaMask wallet to deposit, withdraw, and transfer tokens'
      }
    ]
  };
};

/**
 * Estimate transaction fees
 * @param {string} type - Transaction type (transfer or withdrawal)
 * @param {number} amount - Transaction amount
 * @returns {Object} - Fee estimation details
 */
const estimateFees = async (type, amount) => {
  try {
    let feeEstimate;
    
    if (type === 'transfer') {
      feeEstimate = await web3Service.estimateTransferFee(amount);
    } else if (type === 'withdrawal') {
      feeEstimate = await web3Service.estimateWithdrawalFee(amount);
    } else {
      throw new Error('Invalid transaction type');
    }
    
    return {
      type,
      amount: parseFloat(amount),
      estimatedFee: feeEstimate.fee,
      gasPrice: feeEstimate.gasPrice,
      gasLimit: feeEstimate.gasLimit,
      totalCost: parseFloat(amount) + feeEstimate.fee
    };
  } catch (error) {
    logger.error('Fee estimation failed:', error);
    throw new Error('Failed to estimate fees');
  }
};

module.exports = {
  getWalletBalance,
  getTransactionHistory,
  processDeposit,
  processWithdrawal,
  processTransfer,
  getPaymentMethods,
  estimateFees
};