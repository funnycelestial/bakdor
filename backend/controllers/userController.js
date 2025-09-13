// controllers/userController.js
const User = require('../models/userModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { verifyMessage } = require("ethers");
const crypto = require("crypto");
const web3Service = require('../services/web3Service');

const { genSalt, hash, compare } = bcrypt;
const { sign } = jwt;

/**
 * Generates JWT token for user authentication
 * @param {string} userId - User's MongoDB ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const NONCE_TTL = 5 * 60 * 1000;      // 5 minutes
const MAX_ATTEMPTS = 5;               // 5 tries
const BLOCK_WINDOW = 10 * 60 * 1000;  // 10 minutes

/**
 * @desc    Wallet login (combined nonce + verify flow)
 * @route   POST /api/v1/users/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ message: "Wallet address is required" });
    }
    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    // Create new user if not exists
    if (!user) {
      user = await User.create({
        walletAddress: walletAddress.toLowerCase(),
        anonymousId: crypto.randomBytes(8).toString("hex"),
        balance: 0
      });
    }
    // Rate limiting: block if too many attempts
    const now = Date.now();
    if (user.security.lastLoginAttempt && user.security.loginAttempts >= MAX_ATTEMPTS) {
      if (now - user.security.lastLoginAttempt.getTime() < BLOCK_WINDOW) {
        return res.status(429).json({ message: "Too many login attempts. Please wait." });
      } else {
        user.security.loginAttempts = 0; // reset after window
      }
    }
    // If no signature → generate and return nonce
    if (!signature) {
      user.security.nonce = crypto.randomBytes(16).toString("hex");
      user.security.nonceExpiresAt = new Date(Date.now() + NONCE_TTL);
      await user.save();
      return res.json({
        step: "sign",
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId,
        nonce: user.security.nonce,
        message: `Welcome to bakdor\nNonce: ${user.security.nonce}\nThis signature does not cost gas.`,
        expiresAt: user.security.nonceExpiresAt,
      });
    }
    // Verify nonce validity
    if (!user.security.nonceExpiresAt || Date.now() > user.security.nonceExpiresAt.getTime()) {
      return res.status(400).json({ message: "Nonce expired. Please request a new login." });
    }
    // ✅ v6 verifyMessage
    const message = `Welcome to bakdor\nNonce: ${user.security.nonce}\nThis signature does not cost gas.`;
    const recovered = await verifyMessage(message, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      user.security.loginAttempts += 1;
      user.security.lastLoginAttempt = new Date();
      await user.save();
      return res.status(401).json({ message: "Signature verification failed" });
    }
    // Reset on success
    user.security.nonce = crypto.randomBytes(16).toString("hex"); // rotate nonce
    user.security.nonceExpiresAt = null;
    user.security.lastLogin = new Date();
    user.security.loginAttempts = 0;
    await user.save();
    return res.json({
      step: "verified",
      message: "Login successful",
      user: {
        _id: user._id,
        walletAddress: user.walletAddress,
        anonymousId: user.anonymousId,
        balance: user.balance,
      },
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// @desc     Get user profile with stats
// @route    GET /api/users/me
// @access   Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-security.twoFactorSecret');
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Get user statistics
    const [totalAuctions, totalBids, wonAuctions, balanceSummary] = await Promise.all([
      Auction.countDocuments({ 'seller.userId': req.user.id }),
      Bid.countDocuments({ 'bidder.userId': req.user.id }),
      Bid.countDocuments({ 'bidder.userId': req.user.id, status: 'won' }),
      TokenTransaction.getUserBalanceSummary ? 
        TokenTransaction.getUserBalanceSummary(req.user.id) : 
        { total: 0, available: 0, locked: 0 }
    ]);
    
    // Calculate success rate
    const successRate = totalBids > 0 ? Math.round((wonAuctions / totalBids) * 100) : 0;
    
    // Update user profile stats
    user.profile.totalAuctions = totalAuctions;
    user.profile.wonAuctions = wonAuctions;
    user.profile.successRate = successRate;
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          profile: user.profile,
          privacy: user.privacy,
          preferences: user.preferences,
          status: user.status,
          security: {
            twoFactorEnabled: user.security.twoFactorEnabled,
            lastLogin: user.security.lastLogin
          },
          stats: {
            totalAuctions,
            totalBids,
            wonAuctions,
            successRate,
            balance: balanceSummary
          },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Update user profile
// @route    PUT /api/v1/users/profile
// @access   Private
const updateProfile = async (req, res) => {
  try {
    const { username, phoneNumber, email, profileImage, bio, location, preferences, privacy } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Update fields if provided
    if (username !== undefined) user.username = username;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (email !== undefined) user.email = email;
    if (profileImage !== undefined) user.profileImage = profileImage;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    
    // Update preferences if provided
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }
    
    // Update privacy settings if provided
    if (privacy) {
      user.privacy = { ...user.privacy, ...privacy };
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          phoneNumber: user.phoneNumber,
          email: user.email,
          profileImage: user.profileImage,
          bio: user.bio,
          location: user.location,
          preferences: user.preferences,
          privacy: user.privacy
        }
      }
    });
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Update user balance (deposit/withdraw/lock/release/refund/credit)
// @route    PUT /api/v1/users/balance
// @access   Private
const updateBalance = async (req, res) => {
  try {
    const { action, amount, auctionId } = req.body;

    // Validate action type
    const validActions = ['deposit', 'withdraw', 'lock', 'release', 'refund', 'credit'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid balance action. Must be one of: ${validActions.join(', ')}`
      });
    }

    // Validate amount
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Execute action via blockchain
    let txHash;
    switch (action) {
      case 'deposit':
        txHash = await web3Service.depositTokens(user.walletAddress, amount);
        await user.depositFunds(amount, { auctionId, txHash });
        break;

      case 'withdraw':
        txHash = await web3Service.withdrawTokens(user.walletAddress, amount);
        await user.withdrawFunds(amount, { auctionId, txHash });
        break;

      case 'lock':
        // No direct blockchain call — lock is internal to platform
        await user.lockFunds(amount, auctionId, { txHash: null });
        break;

      case 'release':
        // Funds move from escrow → seller wallet
        txHash = await web3Service.releaseEscrow(user.walletAddress, auctionId, amount);
        await user.releaseFunds(amount, auctionId, { txHash });
        break;

      case 'refund':
        // Funds move from escrow → back to user wallet
        txHash = await web3Service.refundEscrow(user.walletAddress, auctionId, amount);
        await user.refundFunds(amount, auctionId, { txHash });
        break;

      case 'credit':
        // Platform credits (e.g. payouts, bonuses)
        txHash = await web3Service.creditUser(user.walletAddress, amount);
        await user.creditFunds(amount, auctionId, { txHash });
        break;
    }

    // Always refetch to return latest snapshot
    const updatedUser = await User.findById(req.user.id);

    res.json({
      success: true,
      message: `Balance ${action} successful`,
      balance: updatedUser.balance,
      transactions: updatedUser.transactions.slice(-5) // last 5
    });
  } catch (error) {
    logger.error(`Update balance error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Verify user account (Admin only)
// @route    PUT /api/v1/users/:userId/verify
// @access   Private/Admin
const verifyUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { 'profile.isVerified': true },
      { new: true }
    );
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json({ 
      success: true,
      message: `User ${user.email} verified` 
    });
  } catch (error) {
    logger.error(`Verify user error: ${error.message}`);
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Toggle user suspension status (Admin only)
// @route    PUT /api/v1/users/:userId/suspend
// @access   Private/Admin
const toggleSuspension = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    user.status = user.status === 'suspended' ? 'active' : 'suspended';
    await user.save();
    res.json({ 
      success: true,
      message: `User ${user.email} suspension: ${user.status}` 
    });
  } catch (error) {
    logger.error(`Toggle suspension error: ${error.message}`);
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Delete user account
// @route    DELETE /api/v1/users/profile
// @access   Private
const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ 
      success: true,
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    logger.error(`Delete account error: ${error.message}`);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Get user dashboard data
// @route    GET /api/v1/users/dashboard
// @access   Private
const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's active auctions
    const activeAuctions = await Auction.find({
      'seller.userId': userId,
      status: 'active'
    }).limit(10);
    
    // Get user's active bids
    const activeBids = await Bid.find({
      'bidder.userId': userId,
      status: { $in: ['active', 'winning'] }
    }).populate('auction.auctionRef', 'title timing.endTime').limit(10);
    
    // Get recent activity
    const recentActivity = await Promise.all([
      Auction.find({ 'seller.userId': userId }).sort({ createdAt: -1 }).limit(5),
      Bid.find({ 'bidder.userId': userId }).sort({ 'timing.placedAt': -1 }).limit(5)
    ]);
    
    res.json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        activeAuctions,
        activeBids,
        recentAuctions: recentActivity[0],
        recentBids: recentActivity[1]
      }
    });
  } catch (error) {
    logger.error(`Get dashboard error: ${error.message}`);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc     Get user's watched auctions
// @route    GET /api/v1/users/watchlist
// @access   Private
const getWatchlist = async (req, res) => {
  try {
    const auctions = await Auction.find({
      'watchers.userId': req.user.id,
      status: { $in: ['active', 'pending'] }
    }).populate('seller.userId', 'anonymousId profile.reputation');
    
    res.json({
      success: true,
      message: 'Watchlist retrieved successfully',
      data: {
        auctions
      }
    });
  } catch (error) {
    logger.error(`Get watchlist error: ${error.message}`);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Get user's activities (created, bids, watchlist)
// @route   GET /api/v1/users/activities
// @access  Private
const getUserActivity = async (req, res) => {
  try {
    const userId = req.user._id; // comes from auth middleware
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Auctions created by user
    const auctionsCreated = await Auction.find({ "seller.userId": userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("seller.userId", "anonymousId profile.reputation");

    // Auctions where user placed bids
    const bids = await Bid.find({ "bidder.userId": userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("auction.auctionRef");

    const auctionsParticipating = bids.map((b) => b.auction.auctionRef);

    // Auctions the user is watching
    const watchlist = await Auction.find({ watchers: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("seller.userId", "anonymousId profile.reputation");

    return res.json({
      success: true,
      message: "User activity fetched successfully",
      data: {
        activity: {
          auctionsCreated: auctionsCreated.map((a) => a.toObject()),
          auctionsParticipating: auctionsParticipating.map(
            (a) => a.toObject?.() || a
          ),
          watchlist: watchlist.map((a) => ({
            ...a.toObject(),
            isWatching: true,
          })),
        },
        summary: {
          totalCreated: auctionsCreated.length,
          totalParticipating: auctionsParticipating.length,
          totalWatched: watchlist.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user activity",
      error: error.message,
    });
  }
};


module.exports = {
  login,
  getProfile,
  updateProfile, // Added this
  updateBalance,
  verifyUser,
  toggleSuspension,
  deleteAccount,
  getDashboard,
  getWatchlist,
  getUserActivity
};