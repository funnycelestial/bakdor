const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  anonymousId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    sparse: true,
    lowercase: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  profile: {
    reputation: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalAuctions: {
      type: Number,
      default: 0
    },
    wonAuctions: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 0
    },
    memberSince: {
      type: Date,
      default: Date.now
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationLevel: {
      type: String,
      enum: ['none', 'basic', 'advanced', 'premium'],
      default: 'none'
    }
  },
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: String,
    lastLogin: Date,
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    emailVerificationExpires: Date
  },
  privacy: {
    identityMasked: {
      type: Boolean,
      default: true
    },
    showActivity: {
      type: Boolean,
      default: false
    },
    allowDirectMessages: {
      type: Boolean,
      default: false
    }
  },
  preferences: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      bidUpdates: {
        type: Boolean,
        default: true
      },
      auctionEnd: {
        type: Boolean,
        default: true
      },
      escrowUpdates: {
        type: Boolean,
        default: true
      }
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned', 'pending'],
    default: 'active'
  },
  roles: [{
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Indexes for performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ anonymousId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'profile.reputation': -1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to generate anonymous ID
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.anonymousId) {
    this.anonymousId = await this.generateAnonymousId();
  }
  next();
});

// Method to generate anonymous ID
userSchema.methods.generateAnonymousId = async function() {
  const crypto = require('crypto');
  let anonymousId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    anonymousId = `USER_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingUser = await this.constructor.findOne({ anonymousId });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return anonymousId;
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        'security.loginAttempts': 1,
        'security.lockUntil': 1
      }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  if (this.security.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }
  
  return this.updateOne(updates);
};

// Method to update reputation
userSchema.methods.updateReputation = function(rating) {
  const totalRatings = this.profile.totalAuctions;
  const currentReputation = this.profile.reputation;
  
  const newReputation = ((currentReputation * totalRatings) + rating) / (totalRatings + 1);
  
  this.profile.reputation = Math.round(newReputation * 10) / 10;
  return this.save();
};

// Method to calculate success rate
userSchema.methods.calculateSuccessRate = function() {
  if (this.profile.totalAuctions === 0) return 0;
  return Math.round((this.profile.wonAuctions / this.profile.totalAuctions) * 100);
};

// Static method to find by wallet address
userSchema.statics.findByWallet = function(walletAddress) {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

// Static method to find by anonymous ID
userSchema.statics.findByAnonymousId = function(anonymousId) {
  return this.findOne({ anonymousId });
};

module.exports = mongoose.model('User', userSchema);