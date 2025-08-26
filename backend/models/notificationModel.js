const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  recipient: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    anonymousId: {
      type: String,
      required: true
    }
  },
  type: {
    type: String,
    enum: [
      'bid_placed',
      'bid_outbid',
      'auction_won',
      'auction_lost',
      'auction_ending',
      'auction_ended',
      'escrow_funded',
      'escrow_released',
      'delivery_confirmed',
      'dispute_filed',
      'dispute_resolved',
      'payment_received',
      'payment_failed',
      'security_alert',
      'system_maintenance',
      'account_verified',
      'welcome'
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  data: {
    auctionId: String,
    bidId: String,
    escrowId: String,
    disputeId: String,
    transactionId: String,
    amount: Number,
    currency: String,
    customData: mongoose.Schema.Types.Mixed
  },
  channels: {
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      read: {
        type: Boolean,
        default: false
      },
      readAt: Date
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      emailId: String,
      deliveryStatus: {
        type: String,
        enum: ['pending', 'delivered', 'bounced', 'failed']
      }
    },
    push: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      pushId: String,
      deliveryStatus: {
        type: String,
        enum: ['pending', 'delivered', 'failed']
      }
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      smsId: String,
      deliveryStatus: {
        type: String,
        enum: ['pending', 'delivered', 'failed']
      }
    }
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'cancelled'],
    default: 'pending'
  },
  scheduling: {
    scheduledFor: Date,
    isScheduled: {
      type: Boolean,
      default: false
    },
    timezone: String
  },
  metadata: {
    source: {
      type: String,
      enum: ['system', 'user_action', 'blockchain_event', 'scheduled'],
      default: 'system'
    },
    templateId: String,
    templateVersion: String,
    language: {
      type: String,
      default: 'en'
    },
    retryCount: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    }
  },
  actions: [{
    type: {
      type: String,
      enum: ['view', 'approve', 'reject', 'pay', 'dispute', 'custom']
    },
    label: String,
    url: String,
    data: mongoose.Schema.Types.Mixed
  }],
  expiresAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
notificationSchema.index({ notificationId: 1 });
notificationSchema.index({ 'recipient.userId': 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes
notificationSchema.index({ 'recipient.userId': 1, 'channels.inApp.read': 1 });
notificationSchema.index({ 'recipient.userId': 1, createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 });

// Virtual for is read
notificationSchema.virtual('isRead').get(function() {
  return this.channels.inApp.read;
});

// Virtual for is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for age
notificationSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

// Pre-save middleware to generate notification ID
notificationSchema.pre('save', async function(next) {
  if (this.isNew && !this.notificationId) {
    this.notificationId = await this.generateNotificationId();
  }
  next();
});

// Method to generate notification ID
notificationSchema.methods.generateNotificationId = async function() {
  const crypto = require('crypto');
  let notificationId;
  let isUnique = false;
  
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    notificationId = `NOT_${randomBytes.toString('hex').toUpperCase()}`;
    
    const existingNotification = await this.constructor.findOne({ notificationId });
    if (!existingNotification) {
      isUnique = true;
    }
  }
  
  return notificationId;
};

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.channels.inApp.read = true;
  this.channels.inApp.readAt = new Date();
  return this.save();
};

// Method to mark email as sent
notificationSchema.methods.markEmailSent = function(emailId, deliveryStatus = 'pending') {
  this.channels.email.sent = true;
  this.channels.email.sentAt = new Date();
  this.channels.email.emailId = emailId;
  this.channels.email.deliveryStatus = deliveryStatus;
  return this.save();
};

// Method to mark push as sent
notificationSchema.methods.markPushSent = function(pushId, deliveryStatus = 'pending') {
  this.channels.push.sent = true;
  this.channels.push.sentAt = new Date();
  this.channels.push.pushId = pushId;
  this.channels.push.deliveryStatus = deliveryStatus;
  return this.save();
};

// Method to increment retry count
notificationSchema.methods.incrementRetry = function() {
  this.metadata.retryCount += 1;
  
  if (this.metadata.retryCount >= this.metadata.maxRetries) {
    this.status = 'failed';
  }
  
  return this.save();
};

// Method to cancel notification
notificationSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Static method to find unread notifications
notificationSchema.statics.findUnread = function(userId, limit = 50) {
  return this.find({
    'recipient.userId': userId,
    'channels.inApp.read': false,
    status: { $in: ['sent', 'delivered'] }
  })
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Static method to find notifications by type
notificationSchema.statics.findByType = function(userId, type, limit = 20) {
  return this.find({
    'recipient.userId': userId,
    type: type
  })
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Static method to find pending notifications
notificationSchema.statics.findPending = function() {
  return this.find({
    status: 'pending',
    $or: [
      { 'scheduling.isScheduled': false },
      { 'scheduling.scheduledFor': { $lte: new Date() } }
    ]
  })
  .sort({ priority: -1, createdAt: 1 });
};

// Static method to mark all as read for user
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    {
      'recipient.userId': userId,
      'channels.inApp.read': false
    },
    {
      $set: {
        'channels.inApp.read': true,
        'channels.inApp.readAt': new Date()
      }
    }
  );
};

// Static method to get notification stats
notificationSchema.statics.getStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const pipeline = [
    {
      $match: {
        'recipient.userId': mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        read: {
          $sum: {
            $cond: ['$channels.inApp.read', 1, 0]
          }
        },
        unread: {
          $sum: {
            $cond: ['$channels.inApp.read', 0, 1]
          }
        }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Static method to cleanup expired notifications
notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

module.exports = mongoose.model('Notification', notificationSchema);