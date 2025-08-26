const mongoose = require('mongoose');

const tokenTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'deposit',
      'withdrawal', 
      'bid_lock',
      'bid_unlock',
      'escrow_lock',
      'escrow_release',
      'fee_payment',
      'fee_burn',
      'transfer',
      'refund',
      'reward'
    ],
    required: true
  },
  user: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    walletAddress: {
      type: String,
      required: true
    },
    anonymousId: String
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'WKC'
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'cancelled'],
    default: 'pending'
  },
  blockchain: {
    transactionHash: String,
    blockNumber: Number,
    blockHash: String,
    gasUsed: Number,
    gasPrice: String,
    confirmations: {
      type: Number,
      default: 0
    },
    isConfirmed: {
      type: Boolean,
      default: false
    }
  },
  fees: {
    platformFee: {
      type: Number,
      default: 0
    },
    burnAmount: {
      type: Number,
      default: 0
    },
    treasuryAmount: {
      type: Number,
      default: 0
    },
    gasFee: {
      type: Number,
      default: 0
    }
  },
  relatedTo: {
    type: {
      type: String,
      enum: ['auction', 'bid', 'escrow', 'dispute', 'user']
    },
    id: String,
    reference: mongoose.Schema.Types.ObjectId
  },
  mobileMoneyIntegration: {
    provider: {
      type: String,
      enum: ['mtn_momo', 'vodafone_cash', 'airteltigo', 'telecel_cash']
    },
    phoneNumber: String,
    externalTransactionId: String,
    exchangeRate: Number,
    localAmount: Number,
    localCurrency: {
      type: String,
      default: 'GHS'
    },
    providerResponse: mongoose.Schema.Types.Mixed
  },
  metadata: {
    description: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'blockchain'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String,
    initiatedBy: {
      type: String,
      enum: ['user', 'system', 'admin'],
      default: 'user'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
tokenTransactionSchema.index({ transactionId: 1 });
tokenTransactionSchema.index({ 'user.userId': 1 });
tokenTransactionSchema.index({ 'user.walletAddress': 1 });
tokenTransactionSchema.index({ type: 1 });
tokenTransactionSchema.index({ status: 1 });
tokenTransactionSchema.index({ createdAt: -1 });
tokenTransactionSchema.index({ 'blockchain.transactionHash': 1 });

// Compound indexes
tokenTransactionSchema.index({ 'user.userId': 1, type: 1 });
tokenTransactionSchema.index({ 'user.userId': 1, status: 1 });
tokenTransactionSchema.index({ type: 1, status: 1 });

// Pre-save middleware to generate transaction ID
tokenTransactionSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionId) {
    this.transactionId = await this.generateTransactionId();
  }
  next();
});

// Method to generate transaction ID
tokenTransactionSchema.methods.generateTransactionId = async function() {
  const crypto = require('crypto');
  let transactionId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    transactionId = `TXN_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingTransaction = await this.constructor.findOne({ transactionId });
    if (!existingTransaction) {
      isUnique = true;
    }
  }
  
  return transactionId;
};

// Static method to get user balance summary
tokenTransactionSchema.statics.getUserBalanceSummary = async function(userId) {
  const pipeline = [
    { $match: { 'user.userId': mongoose.Types.ObjectId(userId), status: 'confirmed' } },
    {
      $group: {
        _id: null,
        totalDeposits: {
          $sum: {
            $cond: [{ $in: ['$type', ['deposit', 'transfer', 'refund', 'reward']] }, '$amount', 0]
          }
        },
        totalWithdrawals: {
          $sum: {
            $cond: [{ $in: ['$type', ['withdrawal', 'bid_lock', 'escrow_lock', 'fee_payment']] }, { $abs: '$amount' }, 0]
          }
        },
        lockedInBids: {
          $sum: {
            $cond: [{ $eq: ['$type', 'bid_lock'] }, '$amount', 0]
          }
        },
        lockedInEscrow: {
          $sum: {
            $cond: [{ $eq: ['$type', 'escrow_lock'] }, '$amount', 0]
          }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  const summary = result[0] || { totalDeposits: 0, totalWithdrawals: 0, lockedInBids: 0, lockedInEscrow: 0 };
  
  const total = summary.totalDeposits - summary.totalWithdrawals;
  const locked = summary.lockedInBids + summary.lockedInEscrow;
  const available = Math.max(0, total - locked);

  return {
    total,
    available,
    locked,
    deposits: summary.totalDeposits,
    withdrawals: summary.totalWithdrawals
  };
};

// Static method to get platform stats
tokenTransactionSchema.statics.getPlatformStats = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const pipeline = [
    { $match: { createdAt: { $gte: startDate }, status: 'confirmed' } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: { $abs: '$amount' } },
        count: { $sum: 1 },
        totalFees: { $sum: '$fees.platformFee' },
        totalBurned: { $sum: '$fees.burnAmount' }
      }
    }
  ];

  return this.aggregate(pipeline);
};

module.exports = mongoose.model('TokenTransaction', tokenTransactionSchema);