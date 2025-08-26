const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied',
        data: null,
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.userId).select(
      '-security.twoFactorSecret'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid - user not found',
        data: null,
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}`,
        data: null,
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked',
        data: null,
      });
    }

    // Update last activity
    user.lastActivity = new Date();
    await user.save();

    // Add user info to request
    req.user = {
      userId: user._id,
      anonymousId: user.anonymousId,
      walletAddress: user.walletAddress,
      email: user.email,
      roles: user.roles,
      status: user.status,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid',
        data: null,
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        data: null,
      });
    }

    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
    });
  }
};

// Admin authorization middleware
const adminAuth = async (req, res, next) => {
  try {
    // First run regular auth
    await new Promise((resolve, reject) => {
      auth(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin role
    if (!req.user.roles.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - admin privileges required',
        data: null,
      });
    }

    next();
  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
    });
  }
};

// Moderator authorization middleware
const moderatorAuth = async (req, res, next) => {
  try {
    // First run regular auth
    await new Promise((resolve, reject) => {
      auth(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin or moderator role
    if (
      !req.user.roles.includes('admin') &&
      !req.user.roles.includes('moderator')
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - moderator privileges required',
        data: null,
      });
    }

    next();
  } catch (error) {
    logger.error('Moderator auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
    });
  }
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user info
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select(
        '-security.twoFactorSecret'
      );

      if (user && user.status === 'active' && !user.isLocked) {
        req.user = {
          userId: user._id,
          anonymousId: user.anonymousId,
          walletAddress: user.walletAddress,
          email: user.email,
          roles: user.roles,
          status: user.status,
        };

        // Update last activity
        user.lastActivity = new Date();
        await user.save();
      } else {
        req.user = null;
      }
    } catch (tokenError) {
      // Invalid token, continue without user info
      req.user = null;
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    req.user = null;
    next();
  }
};

// Rate limiting by user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const userId = req.user?.userId || req.ip;
    const now = Date.now();

    if (!requests.has(userId)) {
      requests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userRequests = requests.get(userId);

    if (now > userRequests.resetTime) {
      userRequests.count = 1;
      userRequests.resetTime = now + windowMs;
      return next();
    }

    if (userRequests.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        data: {
          retryAfter: Math.ceil((userRequests.resetTime - now) / 1000),
        },
      });
    }

    userRequests.count++;
    next();
  };
};

module.exports = {
  auth,
  adminAuth,
  moderatorAuth,
  optionalAuth,
  userRateLimit,
};
