// controllers/auctionController.js
const mongoose = require('mongoose');
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { validationResult } = require('express-validator');
const notificationService = require('../services/notificationService');
const webSocketController = require('./webSocketController');
const { uploadMultiple } = require('../middleware/upload');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// @route   POST /api/v1/auctions
// @desc    Create new auction with image upload
// @access  Private
const createAuction = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { 
    title, 
    description, 
    startingBid, 
    reservePrice = 0,
    buyNowPrice = 0,
    category, 
    condition, 
    type = 'forward',
    duration,
    brand,
    model,
    year,
    shippingMethod = 'standard',
    shippingCost = 0
  } = req.body;

  // Validate pricing
  if (reservePrice > 0 && reservePrice < startingBid) {
    return res.status(400).json({
      success: false,
      message: 'Reserve price cannot be less than starting bid',
      data: null
    });
  }

  if (buyNowPrice > 0 && buyNowPrice <= Math.max(startingBid, reservePrice)) {
    return res.status(400).json({
      success: false,
      message: 'Buy now price must be greater than starting bid and reserve price',
      data: null
    });
  }

  // Process uploaded images
  const images = [];
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, index) => {
      images.push({
        url: `/uploads/${file.filename}`,
        alt: `${title} - Image ${index + 1}`,
        isPrimary: index === 0
      });
    });
  }

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + parseInt(duration));

  const auction = new Auction({
    title,
    description,
    category,
    type,
    seller: {
      userId: req.user.userId,
      anonymousId: req.user.anonymousId,
      walletAddress: req.user.walletAddress
    },
    pricing: {
      startingBid,
      currentBid: type === 'reverse' ? startingBid : 0,
      reservePrice,
      buyNowPrice
    },
    timing: {
      startTime,
      endTime,
      duration: parseInt(duration)
    },
    images,
    specifications: {
      condition,
      brand,
      model,
      year: year ? parseInt(year) : undefined
    },
    shipping: {
      method: shippingMethod,
      cost: parseFloat(shippingCost)
    },
    status: 'draft'
  });

  await auction.save();

  // Update user's auction count
  await User.findByIdAndUpdate(req.user.userId, {
    $inc: { 'profile.totalAuctions': 1 }
  });

  logger.auction('created', auction.auctionId, {
    userId: req.user.userId,
    title,
    category,
    startingBid
  });

  res.status(201).json({
    success: true,
    message: 'Auction created successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        title: auction.title,
        status: auction.status,
        createdAt: auction.createdAt
      }
    }
  });
});

// @route   GET /api/v1/auctions
// @desc    Get all auctions with filters and real-time data
// @access  Public
const getAuctions = asyncHandler(async (req, res) => {
  const {
    type,
    status = 'active',
    category,
    page = 1,
    limit = 20,
    sort = 'newest',
    search,
    price_min,
    price_max,
    seller
  } = req.query;

  // Build query
  const query = {};
  
  if (type) query.type = type;
  if (status) query.status = status;
  if (category) query.category = category;
  if (seller) query['seller.userId'] = seller;
  
  // Price range filter
  if (price_min || price_max) {
    query['pricing.currentBid'] = {};
    if (price_min) query['pricing.currentBid'].$gte = parseFloat(price_min);
    if (price_max) query['pricing.currentBid'].$lte = parseFloat(price_max);
  }

  // Search filter
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { 'specifications.brand': { $regex: search, $options: 'i' } },
      { 'specifications.model': { $regex: search, $options: 'i' } }
    ];
  }

  // Only show approved auctions to non-moderators
  if (!req.user || !req.user.roles.includes('moderator')) {
    query['moderation.isApproved'] = true;
  }

  // Build sort
  let sortQuery = {};
  switch (sort) {
    case 'newest':
      sortQuery = { createdAt: -1 };
      break;
    case 'oldest':
      sortQuery = { createdAt: 1 };
      break;
    case 'ending_soon':
      sortQuery = { 'timing.endTime': 1 };
      break;
    case 'price_low':
      sortQuery = { 'pricing.currentBid': 1 };
      break;
    case 'price_high':
      sortQuery = { 'pricing.currentBid': -1 };
      break;
    case 'most_bids':
      sortQuery = { 'bidding.totalBids': -1 };
      break;
    default:
      sortQuery = { createdAt: -1 };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('seller.userId', 'anonymousId profile.reputation')
      .select('-seller.walletAddress -blockchain'),
    Auction.countDocuments(query)
  ]);

  // Add real-time data
  const auctionsWithRealTimeData = auctions.map(auction => {
    const auctionObj = auction.toObject();
    
    // Add watcher status for authenticated users
    if (req.user) {
      auctionObj.isWatching = auction.watchers.some(w => 
        w.userId.toString() === req.user.userId
      );
    }
    
    // Add live participant count
    auctionObj.liveParticipants = webSocketController.getAuctionParticipantCount(auction.auctionId);
    auctionObj.liveWatchers = webSocketController.getWatcherCount(auction.auctionId);
    
    return auctionObj;
  });

  logger.api('/auctions', 'GET', 200, { 
    query: req.query, 
    resultCount: auctions.length,
    userId: req.user?.userId 
  });

  res.json({
    success: true,
    message: 'Auctions retrieved successfully',
    data: {
      auctions: auctionsWithRealTimeData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// 3. Get Auction by ID
export const getAuctionById = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id)
      .populate('vendor', 'username profilePhoto rating')
      .populate('highestBidder', 'username profilePhoto');

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    res.json(auction);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// 4. Update Auction
export const updateAuction = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);

    // Validate ownership and timing
    if (auction.vendor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this auction' });
    }

    if (new Date() > auction.startTime) {
      return res.status(400).json({ message: 'Cannot update auction after it has started' });
    }

    const updates = req.body;
    delete updates.startTime; // Prevent startTime manipulation
    delete updates.vendor; // Prevent owner change

    const updatedAuction = await Auction.findByIdAndUpdate(req.params.id, updates, { 
      new: true,
      runValidators: true 
    });

    res.json(updatedAuction);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// 5. Delete Auction
export const deleteAuction = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);

    if (auction.vendor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this auction' });
    }

    if (new Date() > auction.startTime) {
      return res.status(400).json({ message: 'Cannot delete auction after it has started' });
    }

    await auction.remove();
    res.json({ message: 'Auction deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};


// @route   POST /api/v1/auctions/:id/close
// @desc    Close auction with real-time updates
// @access  Private
const closeAuction = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const auction = await Auction.findById(req.params.id)
    .populate('seller.userId', 'id anonymousId')
    .populate('bidding.highestBidder.userId', 'id anonymousId')
    .session(session);

  // Validations
  if (!auction) {
    await session.abortTransaction();
    return res.status(404).json({
      success: false,
      message: 'Auction not found',
      data: null
    });
  }

  // Check ownership
  if (auction.seller.userId.toString() !== req.user.userId) {
    await session.abortTransaction();
    return res.status(403).json({
      success: false,
      message: 'Access denied - not auction owner',
      data: null
    });
  }

  if (auction.status !== 'active') {
    await session.abortTransaction();
    return res.status(400).json({
      success: false,
      message: 'Auction is not active',
      data: null
    });
  }

  const now = new Date();
  if (now < auction.timing.endTime && !req.body.forceClose) {
    await session.abortTransaction();
    return res.status(400).json({
      success: false,
      message: 'Auction has not ended yet',
      data: null
    });
  }

  // Mark as ended
  auction.status = 'ended';

  // Process winner if exists
  if (auction.bidding.highestBidder.userId) {
    // Set winner information
    auction.winner = {
      userId: auction.bidding.highestBidder.userId,
      anonymousId: auction.bidding.highestBidder.anonymousId,
      walletAddress: auction.bidding.highestBidder.walletAddress,
      winningBid: auction.pricing.currentBid,
      wonAt: now
    };

    // Mark winning bid
    await Bid.findOneAndUpdate(
      {
        'auction.auctionRef': auction._id,
        'bidder.userId': auction.bidding.highestBidder.userId,
        status: 'active'
      },
      { status: 'won' },
      { session }
    );

    // Mark other bids as lost
    await Bid.updateMany(
      {
        'auction.auctionRef': auction._id,
        'bidder.userId': { $ne: auction.bidding.highestBidder.userId },
        status: { $in: ['active', 'outbid'] }
      },
      { status: 'lost' },
      { session }
    );

    // Create platform fee transaction
    const platformFee = auction.pricing.currentBid * 0.03; // 3% fee
    await TokenTransaction.create([{
      type: 'fee_payment',
      user: {
        userId: auction.seller.userId._id,
        walletAddress: auction.seller.walletAddress,
        anonymousId: auction.seller.anonymousId
      },
      amount: platformFee,
      fees: {
        platformFee,
        burnAmount: platformFee * 0.5,
        treasuryAmount: platformFee * 0.5
      },
      relatedTo: {
        type: 'auction',
        id: auction.auctionId,
        reference: auction._id
      },
      status: 'confirmed',
      metadata: {
        description: 'Platform fee for auction completion',
        source: 'auction_close',
        initiatedBy: 'system'
      }
    }], { session });
  }

  // Save auction changes
  await auction.save({ session });
  await session.commitTransaction();

  // Real-time notifications
  webSocketController.broadcastAuctionEnd(auction.auctionId, {
    auctionId: auction.auctionId,
    winner: auction.winner?.anonymousId,
    winningBid: auction.winner?.winningBid,
    endedBy: 'seller'
  });

  // Send notifications
  if (auction.winner) {
    await notificationService.sendNotification({
      recipient: {
        userId: auction.winner.userId,
        anonymousId: auction.winner.anonymousId
      },
      type: 'auction_won',
      priority: 'high',
      title: 'Auction Won!',
      message: `Congratulations! You won "${auction.title}" for ${auction.winner.winningBid} WKC.`,
      data: {
        auctionId: auction.auctionId,
        winningBid: auction.winner.winningBid
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    });
  }

  logger.auction('closed_manually', auction.auctionId, {
    userId: req.user.userId,
    winner: auction.winner?.anonymousId
  });

  res.json({
    success: true,
    message: 'Auction closed successfully',
    data: {
      auction: {
        id: auction._id,
        auctionId: auction.auctionId,
        status: auction.status,
        winner: auction.winner
      }
    }
  });
});
// 7. Confirm Item Received
export const confirmReceipt = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);

    if (!auction.highestBidder || auction.highestBidder.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not the auction winner' });
    }

    auction.winnerConfirmed = true;
    auction.vendorPaid = true; // In reality, trigger token transfer here
    
    // Credit vendor's balance (pseudo-code)
    const vendor = await User.findById(auction.vendor);
    vendor.balance += auction.winningBidAmount * 0.9; // Assuming 10% platform fee
    await vendor.save();

    await auction.save();
    res.json({ message: 'Item receipt confirmed. Vendor has been paid.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// 8. Add Delivery Info
export const updateDeliveryInfo = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);

    if (auction.vendor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update delivery info' });
    }

    if (!auction.deliveryRequired) {
      return res.status(400).json({ message: 'This item does not require delivery' });
    }

    auction.deliveryTrackingInfo = req.body.trackingInfo;
    await auction.save();

    res.json({ message: 'Delivery info updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// 9. Get Vendor Auctions
export const getVendorAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find({ vendor: req.user.id })
      .sort({ createdAt: -1 });

    res.json(auctions);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// 10. Get Won Auctions
export const getWonAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find({ 
      highestBidder: req.user.id,
      isActive: false 
    }).populate('vendor', 'username profilePhoto');

    res.json(auctions);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

module.exports = {
  createAuction: [uploadMultiple('images', 10), createAuction],
  getAuctions,
  closeAuction,
  // ... other exports
};