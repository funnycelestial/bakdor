const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

// Create Redis store for rate limiting
const redisStore = new RedisStore({
  sendCommand: (...args) => redisClient.sendCommand(args),
});

// General API rate limiter
const apiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.security('rate_limit_exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      userId: req.user?.userId
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      data: {
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      }
    });
  }
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    data: null
  },
  handler: (req, res) => {
    logger.security('auth_rate_limit_exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      data: {
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      }
    });
  }
});

// Bidding rate limiter
const biddingLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user to 10 bids per minute
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  message: {
    success: false,
    message: 'Too many bids placed, please wait before bidding again.',
    data: null
  },
  handler: (req, res) => {
    logger.security('bidding_rate_limit_exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      auctionId: req.params.id || req.body.auctionId
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many bids placed, please wait before bidding again.',
      data: {
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      }
    });
  }
});

// Payment rate limiter
const paymentLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 payment requests per hour
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  message: {
    success: false,
    message: 'Too many payment requests, please try again later.',
    data: null
  },
  handler: (req, res) => {
    logger.security('payment_rate_limit_exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      paymentMethod: req.body.paymentMethod
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many payment requests, please try again later.',
      data: {
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      }
    });
  }
});

// Admin action rate limiter
const adminLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Limit admin actions
  keyGenerator: (req) => {
    return `admin_${req.user?.userId}`;
  },
  message: {
    success: false,
    message: 'Too many admin actions, please slow down.',
    data: null
  }
});

// Security reporting limiter
const securityLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit security reports
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  message: {
    success: false,
    message: 'Too many security reports, please try again later.',
    data: null
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  biddingLimiter,
  paymentLimiter,
  adminLimiter,
  securityLimiter
};