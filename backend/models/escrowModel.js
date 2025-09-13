const mongoose = require('mongoose');

const escrowSchema = new mongoose.Schema({
  escrowId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  auction: {
    auctionId: {
      type: String,
      required: true
    },
    auctionRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true
    }
  },
  buyer: {
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
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['created', 'funded', 'delivered', 'confirmed', 'released', 'disputed', 'resolved'],
    default: 'created',
    index: true
  },
  blockchain: {
    contractAddress: String,
    transactionHash: String,
    blockNumber: Number,
    isOnChain: {
      type: Boolean,
      default: false
    }
  },
  delivery: {
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    deliveredAt: Date,
    confirmedBy: String
  },
  dispute: {
    isDisputed: {
      type: Boolean,
      default: false
    },
    disputeId: String,
    reason: String,
    filedAt: Date,
    evidence: [{
      type: String // URLs to evidence files
    }],
    resolution: {
      type: String,
      enum: ['buyer_refund', 'seller_payment', 'partial_refund', 'cancelled']
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    notes: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  fees: {
    platformFee: {
      type: Number,
      default: 0
    },
    arbitrationFee: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    tags: [String],
    notes: String,
    specialConditions: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
escrowSchema.index({ 'buyer.userId': 1, status: 1 });
escrowSchema.index({ 'seller.userId': 1, status: 1 });
escrowSchema.index({ createdAt: -1 });
escrowSchema.index({ 'dispute.isDisputed': 1 });
escrowSchema.index({ 'blockchain.transactionHash': 1 });

// Virtual for time in current status
escrowSchema.virtual('timeInStatus').get(function() {
  if (!this.timeline || this.timeline.length < 2) return 0;
  
  const currentStatusEntry = this.timeline[this.timeline.length - 1];
  const previousStatusEntry = this.timeline[this.timeline.length - 2];
  
  return currentStatusEntry.timestamp - previousStatusEntry.timestamp;
});

// Virtual for dispute duration
escrowSchema.virtual('disputeDuration').get(function() {
  if (!this.dispute.isDisputed || !this.dispute.filedAt) return 0;
  
  const endTime = this.dispute.resolvedAt || new Date();
  return endTime - this.dispute.filedAt;
});

// Pre-save middleware to update timeline
escrowSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      notes: `Status changed to ${this.status}`,
      updatedBy: this.updatedBy || this.buyer.userId // Default to buyer if not specified
    });
  }
  next();
});

// Method to add timeline entry
escrowSchema.methods.addTimelineEntry = function(status, notes, updatedBy) {
  this.timeline.push({
    status,
    timestamp: new Date(),
    notes,
    updatedBy
  });
  return this.save();
};

// Method to fund escrow
escrowSchema.methods.fundEscrow = function(transactionHash) {
  this.status = 'funded';
  this.blockchain.transactionHash = transactionHash;
  this.blockchain.isOnChain = true;
  return this.save();
};

// Method to mark as delivered
escrowSchema.methods.markAsDelivered = function(trackingInfo) {
  this.status = 'delivered';
  this.delivery = {
    ...this.delivery,
    ...trackingInfo,
    deliveredAt: new Date()
  };
  return this.save();
};

// Method to confirm delivery
escrowSchema.methods.confirmDelivery = function(confirmedBy, transactionHash) {
  this.status = 'released';
  this.delivery.confirmedBy = confirmedBy;
  this.blockchain.transactionHash = transactionHash;
  this.blockchain.isOnChain = true;
  return this.save();
};

// Method to initiate dispute
escrowSchema.methods.initiateDispute = function(disputeData) {
  this.status = 'disputed';
  this.dispute = {
    ...this.dispute,
    ...disputeData,
    isDisputed: true,
    filedAt: new Date()
  };
  return this.save();
};

// Method to resolve dispute
escrowSchema.methods.resolveDispute = function(resolutionData) {
  this.status = 'resolved';
  this.dispute = {
    ...this.dispute,
    ...resolutionData,
    resolvedAt: new Date()
  };
  return this.save();
};

// Static method to generate unique escrow ID
escrowSchema.statics.generateEscrowId = async function() {
  const crypto = require('crypto');
  let escrowId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    escrowId = `ESC_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingEscrow = await this.findOne({ escrowId });
    if (!existingEscrow) {
      isUnique = true;
    }
  }
  
  return escrowId;
};

// Static method to get escrow statistics
escrowSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  const totalEscrows = await this.countDocuments();
  const disputedCount = await this.countDocuments({ 'dispute.isDisputed': true });
  
  return {
    byStatus: stats,
    totalEscrows,
    disputedCount,
    disputeRate: totalEscrows > 0 ? (disputedCount / totalEscrows) * 100 : 0
  };
};

module.exports = mongoose.model('Escrow', escrowSchema);