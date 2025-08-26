const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  bidId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  auction: {
    auctionId: {
      type: String,
      required: true,
      index: true
    },
    auctionRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true
    }
  },
  bidder: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    anonymousId: {
      type: String,
      required: true
    },
    walletAddress: {
      type: String,
      required: true
    }
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'WKC'
  },
  type: {
    type: String,
    enum: ['bid', 'auto-bid', 'buy-now'],
    default: 'bid'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'outbid', 'winning', 'won', 'lost', 'cancelled', 'refunded'],
    default: 'pending'
  },
  blockchain: {
    transactionHash: String,
    blockNumber: Number,
    gasUsed: Number,
    gasPrice: String,
    isOnChain: {
      type: Boolean,
      default: false
    },
    lockTransactionHash: String, // Transaction hash for locking tokens
    lockBlockNumber: Number
  },
  timing: {
    placedAt: {
      type: Date,
      default: Date.now
    },
    confirmedAt: Date,
    expiredAt: Date,
    refundedAt: Date
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceFingerprint: String,
    bidSource: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    }
  },
  autoBid: {
    isAutoBid: {
      type: Boolean,
      default: false
    },
    maxAmount: Number,
    increment: Number,
    isActive: {
      type: Boolean,
      default: false
    }
  },
  validation: {
    isValid: {
      type: Boolean,
      default: true
    },
    validationErrors: [String],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    flagged: {
      type: Boolean,
      default: false
    },
    flagReason: String
  },
  refund: {
    isRefunded: {
      type: Boolean,
      default: false
    },
    refundAmount: Number,
    refundTransactionHash: String,
    refundedAt: Date,
    refundReason: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
bidSchema.index({ bidId: 1 });
bidSchema.index({ 'auction.auctionId': 1 });
bidSchema.index({ 'bidder.userId': 1 });
bidSchema.index({ 'bidder.walletAddress': 1 });
bidSchema.index({ status: 1 });
bidSchema.index({ amount: -1 });
bidSchema.index({ 'timing.placedAt': -1 });

// Compound indexes
bidSchema.index({ 'auction.auctionId': 1, amount: -1 });
bidSchema.index({ 'bidder.userId': 1, status: 1 });
bidSchema.index({ 'auction.auctionId': 1, 'timing.placedAt': -1 });

// Virtual for bid age
bidSchema.virtual('age').get(function() {
  return Date.now() - this.timing.placedAt;
});

// Virtual for is recent
bidSchema.virtual('isRecent').get(function() {
  const fiveMinutes = 5 * 60 * 1000;
  return this.age < fiveMinutes;
});

// Pre-save middleware to generate bid ID
bidSchema.pre('save', async function(next) {
  if (this.isNew && !this.bidId) {
    this.bidId = await this.generateBidId();
  }
  next();
});

// Method to generate bid ID
bidSchema.methods.generateBidId = async function() {
  const crypto = require('crypto');
  let bidId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    bidId = `BID_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingBid = await this.constructor.findOne({ bidId });
    if (!existingBid) {
      isUnique = true;
    }
  }
  
  return bidId;
};

// Method to confirm bid on blockchain
bidSchema.methods.confirmOnChain = function(transactionHash, blockNumber, gasUsed) {
  this.blockchain.transactionHash = transactionHash;
  this.blockchain.blockNumber = blockNumber;
  this.blockchain.gasUsed = gasUsed;
  this.blockchain.isOnChain = true;
  this.timing.confirmedAt = new Date();
  this.status = 'active';
  
  return this.save();
};

// Method to mark as outbid
bidSchema.methods.markAsOutbid = function() {
  if (this.status === 'active' || this.status === 'winning') {
    this.status = 'outbid';
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to mark as winning
bidSchema.methods.markAsWinning = function() {
  if (this.status === 'active') {
    this.status = 'winning';
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to mark as won
bidSchema.methods.markAsWon = function() {
  if (this.status === 'winning') {
    this.status = 'won';
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to refund bid - RENAMED to processRefund
bidSchema.methods.processRefund = function(reason, transactionHash) {
  this.refund.isRefunded = true;
  this.refund.refundAmount = this.amount;
  this.refund.refundTransactionHash = transactionHash;
  this.refund.refundedAt = new Date();
  this.refund.refundReason = reason;
  this.status = 'refunded';
  this.timing.refundedAt = new Date();
  
  return this.save();
};

// Method to calculate risk score
bidSchema.methods.calculateRiskScore = function() {
  let riskScore = 0;
  
  // Check for rapid bidding
  const recentBids = this.constructor.find({
    'bidder.userId': this.bidder.userId,
    'timing.placedAt': { $gte: new Date(Date.now() - 60000) } // Last minute
  });
  
  if (recentBids.length > 5) riskScore += 30;
  
  // Check for unusual amounts
  if (this.amount > 10000) riskScore += 20;
  
  // Check for new user
  const User = mongoose.model('User');
  User.findById(this.bidder.userId).then(user => {
    if (user && user.profile.totalAuctions < 5) {
      riskScore += 25;
    }
  });
  
  this.validation.riskScore = Math.min(riskScore, 100);
  this.validation.flagged = riskScore > 70;
  
  return this.save();
};

// Static method to find bids by auction
bidSchema.statics.findByAuction = function(auctionId) {
  return this.find({ 'auction.auctionId': auctionId })
    .sort({ amount: -1, 'timing.placedAt': -1 });
};

// Static method to find user bids
bidSchema.statics.findByUser = function(userId, status = null) {
  const query = { 'bidder.userId': userId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('auction.auctionRef', 'title status timing.endTime')
    .sort({ 'timing.placedAt': -1 });
};

// Static method to find winning bids
bidSchema.statics.findWinning = function() {
  return this.find({ status: 'winning' })
    .populate('auction.auctionRef', 'title timing.endTime')
    .populate('bidder.userId', 'anonymousId');
};

module.exports = mongoose.model('Bid', bidSchema);