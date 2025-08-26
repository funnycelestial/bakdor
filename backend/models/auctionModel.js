const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  auctionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'electronics',
      'fashion',
      'home-garden',
      'sports',
      'automotive',
      'books',
      'art',
      'collectibles',
      'services',
      'other'
    ]
  },
  type: {
    type: String,
    enum: ['forward', 'reverse'],
    default: 'forward'
  },
  seller: {
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
  pricing: {
    startingBid: {
      type: Number,
      required: true,
      min: 0
    },
    currentBid: {
      type: Number,
      default: 0
    },
    reservePrice: {
      type: Number,
      default: 0
    },
    buyNowPrice: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'WKC'
    }
  },
  timing: {
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    duration: {
      type: Number, // in milliseconds
      required: true
    },
    extensionTime: {
      type: Number,
      default: 300000 // 5 minutes in milliseconds
    },
    autoExtend: {
      type: Boolean,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'ended', 'cancelled', 'suspended'],
    default: 'draft'
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  specifications: {
    condition: {
      type: String,
      enum: ['new', 'like-new', 'good', 'fair', 'poor'],
      required: true
    },
    brand: String,
    model: String,
    year: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      weight: Number,
      unit: {
        type: String,
        enum: ['cm', 'in', 'kg', 'lbs'],
        default: 'cm'
      }
    },
    customFields: [{
      name: String,
      value: String
    }]
  },
  shipping: {
    method: {
      type: String,
      enum: ['pickup', 'standard', 'express', 'digital'],
      default: 'standard'
    },
    cost: {
      type: Number,
      default: 0
    },
    location: {
      country: String,
      state: String,
      city: String,
      zipCode: String
    },
    estimatedDelivery: {
      min: Number, // days
      max: Number  // days
    }
  },
  bidding: {
    totalBids: {
      type: Number,
      default: 0
    },
    uniqueBidders: {
      type: Number,
      default: 0
    },
    highestBidder: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      anonymousId: String,
      walletAddress: String
    },
    bidIncrement: {
      type: Number,
      default: 1
    },
    lastBidTime: Date
  },
  watchers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    watchersCount: {
      type: Number,
      default: 0
    },
    averageBidTime: Number,
    peakActivity: Date
  },
  blockchain: {
    contractAddress: String,
    transactionHash: String,
    blockNumber: Number,
    gasUsed: Number,
    isOnChain: {
      type: Boolean,
      default: false
    }
  },
  moderation: {
    isApproved: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    flags: [{
      reason: String,
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reportedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  winner: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    anonymousId: String,
    walletAddress: String,
    winningBid: Number,
    wonAt: Date
  },
  escrow: {
    escrowId: String,
    status: {
      type: String,
      enum: ['none', 'pending', 'funded', 'released', 'disputed'],
      default: 'none'
    },
    contractAddress: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
auctionSchema.index({ auctionId: 1 });
auctionSchema.index({ status: 1 });
auctionSchema.index({ category: 1 });
auctionSchema.index({ 'timing.endTime': 1 });
auctionSchema.index({ 'timing.startTime': 1 });
auctionSchema.index({ 'seller.userId': 1 });
auctionSchema.index({ 'bidding.highestBidder.userId': 1 });
auctionSchema.index({ createdAt: -1 });
auctionSchema.index({ 'pricing.currentBid': -1 });

// Compound indexes
auctionSchema.index({ status: 1, 'timing.endTime': 1 });
auctionSchema.index({ category: 1, status: 1 });
auctionSchema.index({ 'seller.userId': 1, status: 1 });

// Virtual for time remaining
auctionSchema.virtual('timeRemaining').get(function() {
  if (this.status !== 'active') return 0;
  const now = new Date();
  const remaining = this.timing.endTime - now;
  return Math.max(0, remaining);
});

// Virtual for is active
auctionSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         now >= this.timing.startTime && 
         now < this.timing.endTime;
});

// Virtual for has reserve met
auctionSchema.virtual('isReserveMet').get(function() {
  return this.pricing.reservePrice === 0 || 
         this.pricing.currentBid >= this.pricing.reservePrice;
});

// Pre-save middleware to generate auction ID
auctionSchema.pre('save', async function(next) {
  if (this.isNew && !this.auctionId) {
    this.auctionId = await this.generateAuctionId();
  }
  next();
});

// Method to generate auction ID
auctionSchema.methods.generateAuctionId = async function() {
  const crypto = require('crypto');
  let auctionId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    auctionId = `AUC_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingAuction = await this.constructor.findOne({ auctionId });
    if (!existingAuction) {
      isUnique = true;
    }
  }
  
  return auctionId;
};

// Method to place bid
auctionSchema.methods.placeBid = function(bidAmount, bidder) {
  if (bidAmount > this.pricing.currentBid) {
    this.pricing.currentBid = bidAmount;
    this.bidding.highestBidder = {
      userId: bidder.userId,
      anonymousId: bidder.anonymousId,
      walletAddress: bidder.walletAddress
    };
    this.bidding.totalBids += 1;
    
    // Update unique bidders count
    const existingBidder = this.bidding.uniqueBidders || 0;
    // In a real implementation, you'd check if this bidder already bid
    this.bidding.uniqueBidders = existingBidder + 1;
    
    this.bidding.lastBidTime = new Date();
    
    // Auto-extend if within extension time
    if (this.timing.autoExtend) {
      const timeRemaining = this.timing.endTime - new Date();
      if (timeRemaining < this.timing.extensionTime) {
        this.timing.endTime = new Date(Date.now() + this.timing.extensionTime);
      }
    }
  }
  
  return this.save();
};

// Method to end auction
auctionSchema.methods.endAuction = function() {
  this.status = 'ended';
  
  if (this.bidding.highestBidder.userId && this.isReserveMet) {
    this.winner = {
      userId: this.bidding.highestBidder.userId,
      anonymousId: this.bidding.highestBidder.anonymousId,
      walletAddress: this.bidding.highestBidder.walletAddress,
      winningBid: this.pricing.currentBid,
      wonAt: new Date()
    };
  }
  
  return this.save();
};

// Method to add watcher
auctionSchema.methods.addWatcher = function(userId) {
  const isWatching = this.watchers.some(w => w.userId.toString() === userId.toString());
  
  if (!isWatching) {
    this.watchers.push({ userId });
    this.analytics.watchersCount = this.watchers.length;
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to remove watcher
auctionSchema.methods.removeWatcher = function(userId) {
  this.watchers = this.watchers.filter(w => w.userId.toString() !== userId.toString());
  this.analytics.watchersCount = this.watchers.length;
  return this.save();
};

// Static method to find active auctions
auctionSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    status: 'active',
    'timing.startTime': { $lte: now },
    'timing.endTime': { $gt: now }
  });
};

// Static method to find ending soon
auctionSchema.statics.findEndingSoon = function(minutes = 60) {
  const now = new Date();
  const endTime = new Date(now.getTime() + (minutes * 60 * 1000));
  
  return this.find({
    status: 'active',
    'timing.endTime': { $gte: now, $lte: endTime }
  }).sort({ 'timing.endTime': 1 });
};

module.exports = mongoose.model('Auction', auctionSchema);