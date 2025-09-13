const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  disputeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  escrowId: {
    type: String,
    required: true,
    index: true
  },
  auction: {
    auctionId: String,
    auctionRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction'
    }
  },
  initiator: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    anonymousId: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true
    }
  },
  respondent: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    anonymousId: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true
    }
  },
  reason: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['item_not_as_described', 'item_not_received', 'damaged_item', 'late_delivery', 'other'],
    required: true
  },
  requestedResolution: {
    type: String,
    enum: ['full_refund', 'partial_refund', 'item_return', 'replacement', 'other']
  },
  admin: {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: Date,
    notes: String,
    estimatedResolutionDate: Date
  },
  resolution: {
    decision: {
      type: String,
      enum: ['buyer_favor', 'seller_favor', 'partial_refund', 'no_action', 'cancelled']
    },
    reasoning: {
      type: String,
      required: function() { return this.status === 'resolved'; }
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    refundPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    refundAmount: {
      type: Number,
      default: 0
    }
  },
  communication: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    isAdminMessage: {
      type: Boolean,
      default: false
    }
  }],
  evidence: [{
    type: {
      type: String,
      enum: ['image', 'document', 'link', 'text'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  metadata: {
    tags: [String],
    escalationCount: {
      type: Number,
      default: 0
    },
    lastEscalatedAt: Date,
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    satisfactionFeedback: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
disputeSchema.index({ 'initiator.userId': 1, status: 1 });
disputeSchema.index({ 'respondent.userId': 1, status: 1 });
disputeSchema.index({ 'admin.assignedTo': 1, status: 1 });
disputeSchema.index({ createdAt: -1 });
disputeSchema.index({ category: 1 });
disputeSchema.index({ priority: -1 });

// Virtual for dispute duration
disputeSchema.virtual('duration').get(function() {
  if (this.status === 'resolved' && this.resolution.resolvedAt) {
    return this.resolution.resolvedAt - this.createdAt;
  }
  return Date.now() - this.createdAt;
});

// Virtual for days to resolution
disputeSchema.virtual('daysToResolution').get(function() {
  const duration = this.duration;
  return Math.floor(duration / (1000 * 60 * 60 * 24));
});

// Virtual for response time
disputeSchema.virtual('responseTime').get(function() {
  if (this.communication.length > 1) {
    const firstResponse = this.communication[1];
    return firstResponse.timestamp - this.communication[0].timestamp;
  }
  return null;
});

// Pre-save middleware to update timeline
disputeSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      notes: `Status changed to ${this.status}`,
      updatedBy: this.updatedBy || this.initiator.userId
    });
  }
  next();
});

// Method to add communication
disputeSchema.methods.addCommunication = function(userId, message, isAdminMessage = false) {
  this.communication.push({
    from: userId,
    message,
    timestamp: new Date(),
    isAdminMessage
  });
  return this.save();
};

// Method to add evidence
disputeSchema.methods.addEvidence = function(type, content, description, uploadedBy) {
  this.evidence.push({
    type,
    content,
    description,
    uploadedBy,
    uploadedAt: new Date()
  });
  return this.save();
};

// Method to assign admin
disputeSchema.methods.assignAdmin = function(adminId, notes, estimatedResolutionDate) {
  this.admin.assignedTo = adminId;
  this.admin.assignedAt = new Date();
  this.admin.notes = notes;
  this.admin.estimatedResolutionDate = estimatedResolutionDate;
  this.status = 'investigating';
  return this.save();
};

// Method to resolve dispute
disputeSchema.methods.resolveDispute = function(decision, reasoning, resolvedBy, refundPercentage = 0) {
  this.status = 'resolved';
  this.resolution = {
    decision,
    reasoning,
    resolvedAt: new Date(),
    resolvedBy,
    refundPercentage,
    refundAmount: this.calculateRefundAmount(refundPercentage)
  };
  return this.save();
};

// Method to calculate refund amount
disputeSchema.methods.calculateRefundAmount = function(refundPercentage) {
  // This would typically fetch the escrow amount
  // For now, we'll return a placeholder
  return 0; // This would be calculated based on the actual escrow amount
};

// Method to escalate dispute
disputeSchema.methods.escalateDispute = function() {
  this.metadata.escalationCount += 1;
  this.metadata.lastEscalatedAt = new Date();
  this.priority = this.priority === 'low' ? 'medium' : 
                 this.priority === 'medium' ? 'high' : 'urgent';
  return this.save();
};

// Static method to generate unique dispute ID
disputeSchema.statics.generateDisputeId = async function() {
  const crypto = require('crypto');
  let disputeId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    disputeId = `DSP_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingDispute = await this.findOne({ disputeId });
    if (!existingDispute) {
      isUnique = true;
    }
  }
  
  return disputeId;
};

// Static method to get dispute statistics
disputeSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        averageDuration: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
      }
    }
  ]);
  
  const byCategory = await this.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const byPriority = await this.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const totalDisputes = await this.countDocuments();
  const resolvedDisputes = await this.countDocuments({ status: 'resolved' });
  
  return {
    byStatus: stats,
    byCategory,
    byPriority,
    totalDisputes,
    resolvedDisputes,
    resolutionRate: totalDisputes > 0 ? (resolvedDisputes / totalDisputes) * 100 : 0
  };
};

module.exports = mongoose.model('Dispute', disputeSchema);