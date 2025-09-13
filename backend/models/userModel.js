const mongoose = require('mongoose');

const { Schema } = mongoose;

/* Transaction Subdocument*/
const transactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'deposit',        // user deposit/top-up
        'withdraw',       // user withdrawal
        'escrow_lock',    // move available -> locked
        'escrow_release', // locked leaves user (to seller/treasury)
        'refund',         // locked -> available (cancellation/dispute resolved)
        'credit'          // platform credit / incoming payment (e.g., seller receives)
      ],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    auctionId: { type: String },      // keep as string to match your auctionId usage
    txHash: { type: String },         // optional on-chain reference
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'reversed'],
      default: 'confirmed'
    },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed },
    balanceSnapshot: {
      total: { type: Number, required: true },
      available: { type: Number, required: true },
      locked: { type: Number, required: true }
    }
  },
  { _id: true, timestamps: true }
);

/*User Schema*/
const userSchema = new Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    },

    anonymousId: {
      type: String,
      unique: true,
      default: () => 'anon_' + Math.random().toString(36).substring(2, 10),
      index: true
    },

    // 📧 Optional contact for notifications
    email: {
      type: String,
      sparse: true,
      lowercase: true
    },
    isEmailVerified: { type: Boolean, default: false },

    // 📱 Optional phone contact (security/notifications, not login)
    security: {
      phoneNumber: { type: String },

      // 🔐 2FA
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorSecret: { type: String },

      // 👤 Login metadata
      lastLogin: { type: Date },
      loginAttempts: { type: Number, default: 0 },
      lastLoginAttempt: { type: Date },
      lockUntil: { type: Date },

      // 🪪 Nonce-based wallet login
      nonce: {
        type: String,
        default: () => Math.floor(Math.random() * 1000000).toString()
      },
      nonceExpiresAt: { type: Date }
    },

    balance: {
      total: { type: Number, default: 0 },     // derived: available + locked
      available: { type: Number, default: 0 }, // spendable
      locked: { type: Number, default: 0 }     // escrow, holds, etc.
    },

    // 🧾 Transaction history (append-only)
    transactions: [transactionSchema],

    // Profile (persisted successRate field; auto-synced in pre-save)
    profile: {
      username: { type: String },
      trustMeBros: { type: Number, default: 0, min: 0 },
      totalAuctions: { type: Number, default: 0 },
      wonAuctions: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 }, // persisted field
      memberSince: { type: Date, default: Date.now }
    },

    staking: {
      currentStake: { type: Number, default: 0, min: 0 },
      totalStaked: { type: Number, default: 0, min: 0 },
      totalSlashed: { type: Number, default: 0, min: 0 },
      lastStakeDate: Date
    },

    privacy: {
      identityMasked: { type: Boolean, default: true },
      showActivity: { type: Boolean, default: false },
      allowDirectMessages: { type: Boolean, default: false }
    },

    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        bidUpdates: { type: Boolean, default: true },
        auctionEnd: { type: Boolean, default: true },
        escrowUpdates: { type: Boolean, default: true }
      },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' }
    },

    status: {
      type: String,
      enum: ['active', 'suspended', 'banned', 'pending'],
      default: 'active'
    },

    roles: [
      {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
      }
    ],

    lastActivity: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Lock state
userSchema.virtual('isLocked').get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// NOTE: Avoid conflict with persisted successRate
userSchema.virtual('profile.successRateComputed').get(function () {
  const p = this.profile || {};
  if (!p.totalAuctions) return 0;
  return Math.round(((p.wonAuctions || 0) / p.totalAuctions) * 100);
});

// Indexes
userSchema.index({ walletAddress: 1 });
userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'profile.trustMeBros': -1 });
userSchema.index({ createdAt: -1 });

// Transactions indexes
userSchema.index({ 'transactions.type': 1, 'transactions.createdAt': -1 });
userSchema.index({ 'transactions.status': 1, 'transactions.createdAt': -1 });

/* Helpers (internal) */
function round(n) {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}

userSchema.methods._recomputeTotal = function () {
  this.balance.total = round(this.balance.available + this.balance.locked);
};

userSchema.methods._assertNonNegativeBalances = function () {
  if (this.balance.available < 0 || this.balance.locked < 0) {
    throw new Error('Balance invariant violated: negative available/locked');
  }
};

userSchema.methods._snapshotAndRecordTx = function (entry) {
  const snap = {
    total: this.balance.total,
    available: this.balance.available,
    locked: this.balance.locked
  };
  this.transactions.push({ ...entry, balanceSnapshot: snap });
  this.lastActivity = new Date();
};

/* Balance Methods (public) */
userSchema.methods.depositFunds = async function (amount, opts = {}) {
  if (!(amount > 0)) throw new Error('Deposit amount must be > 0');
  this.balance.available = round(this.balance.available + amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'deposit',
    amount,
    ...opts
  });
  return this.save();
};

userSchema.methods.withdrawFunds = async function (amount, opts = {}) {
  if (!(amount > 0)) throw new Error('Withdraw amount must be > 0');
  if (this.balance.available < amount) throw new Error('Insufficient available balance');
  this.balance.available = round(this.balance.available - amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'withdraw',
    amount,
    ...opts
  });
  return this.save();
};

userSchema.methods.lockFunds = async function (amount, auctionId, opts = {}) {
  if (!(amount > 0)) throw new Error('Lock amount must be > 0');
  if (this.balance.available < amount) throw new Error('Insufficient available balance to lock');
  this.balance.available = round(this.balance.available - amount);
  this.balance.locked = round(this.balance.locked + amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'escrow_lock',
    amount,
    auctionId,
    ...opts
  });
  return this.save();
};

userSchema.methods.releaseFunds = async function (amount, auctionId, opts = {}) {
  if (!(amount > 0)) throw new Error('Release amount must be > 0');
  if (this.balance.locked < amount) throw new Error('Insufficient locked balance to release');
  this.balance.locked = round(this.balance.locked - amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'escrow_release',
    amount,
    auctionId,
    ...opts
  });
  return this.save();
};

userSchema.methods.refundFunds = async function (amount, auctionId, opts = {}) {
  if (!(amount > 0)) throw new Error('Refund amount must be > 0');
  if (this.balance.locked < amount) throw new Error('Insufficient locked balance to refund');
  this.balance.locked = round(this.balance.locked - amount);
  this.balance.available = round(this.balance.available + amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'refund',
    amount,
    auctionId,
    ...opts
  });
  return this.save();
};

userSchema.methods.creditFunds = async function (amount, auctionId, opts = {}) {
  if (!(amount > 0)) throw new Error('Credit amount must be > 0');
  this.balance.available = round(this.balance.available + amount);
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  this._snapshotAndRecordTx({
    type: 'credit',
    amount,
    auctionId,
    ...opts
  });
  return this.save();
};

/* Reputation / Staking Methods */
userSchema.methods.incLoginAttempts = function () {
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.loginAttempts': 1, 'security.lockUntil': 1 }
    });
  }
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  if (this.security.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hrs
  }
  return this.updateOne(updates);
};

userSchema.methods.addTMB = function (amount = 1) {
  this.profile.trustMeBros = Math.max(0, (this.profile.trustMeBros || 0) + amount);
  this.lastActivity = new Date();
  return this.save();
};

userSchema.methods.removeTMB = function (amount = 1) {
  this.profile.trustMeBros = Math.max(0, (this.profile.trustMeBros || 0) - amount);
  this.lastActivity = new Date();
  return this.save();
};

userSchema.methods.stakeTokens = function (amount) {
  if (amount <= 0) throw new Error('Stake amount must be positive');
  this.staking.currentStake += amount;
  this.staking.totalStaked += amount;
  this.staking.lastStakeDate = new Date();
  this.lastActivity = new Date();
  return this.save();
};

userSchema.methods.slashStake = function (amount) {
  const slashAmount = Math.min(this.staking.currentStake, amount);
  this.staking.currentStake -= slashAmount;
  this.staking.totalSlashed += slashAmount;
  this.lastActivity = new Date();
  return this.save();
};

userSchema.methods.calculateSuccessRate = function () {
  if (!this.profile.totalAuctions) return 0;
  return Math.round(((this.profile.wonAuctions || 0) / this.profile.totalAuctions) * 100);
};

/* Hooks */
userSchema.pre('save', function (next) {
  this._recomputeTotal();
  this._assertNonNegativeBalances();
  if (this.profile) {
    const total = this.profile.totalAuctions || 0;
    const won = this.profile.wonAuctions || 0;
    this.profile.successRate = total === 0 ? 0 : Math.round((won / total) * 100);
  }
  next();
});

/* Statics */
userSchema.statics.findByWallet = function (walletAddress) {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);
