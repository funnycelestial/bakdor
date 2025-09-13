// controllers/auctionController.js
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const Bid = require('../models/bidModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const notificationService = require('../services/notificationService');
const webSocketController = require('./webSocketController');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Helper imports
const ApiError = require('../utils/apiError');
const {
  resolveAuctionQuery,
  SELLER_PUBLIC_FIELDS,
  assertOwnership,
  assertEditableBeforeStart,
  assertTransitionAllowed
} = require('../utils/auctionHelpers');

// Helper to generate a unique auctionId
const generateAuctionId = async () => {
  let auctionId;
  let isUnique = false;
  while (!isUnique) {
    const randomBytes = crypto.randomBytes(4);
    auctionId = `AUC_${randomBytes.toString('hex').toUpperCase()}`;
    const existingAuction = await Auction.findOne({ auctionId });
    if (!existingAuction) isUnique = true;
  }
  return auctionId;
};

// Create a new auction
const createAuction = async (auctionData, userId) => {
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
    shippingCost = 0,
    images = []
  } = auctionData;
  
  // Fetch user to populate seller info
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  
  // Validate pricing
  if (reservePrice > 0 && reservePrice < startingBid)
    throw new ApiError(400, 'Reserve price cannot be less than starting bid');
  if (buyNowPrice > 0 && buyNowPrice <= Math.max(startingBid, reservePrice))
    throw new ApiError(400, 'Buy now price must be greater than starting bid and reserve price');
  
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + parseInt(duration));
  
  // Generate unique auction ID
  const auctionId = await generateAuctionId();
  
  const auction = new Auction({
    auctionId,
    title,
    description,
    category,
    type,
    seller: {
      userId: user._id,
      walletAddress: user.walletAddress,
      anonymousId: user.anonymousId
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
    status: 'pending'
  });
  
  await auction.save();
  
  // Update user's auction count
  await User.findByIdAndUpdate(userId, {
    $inc: { 'profile.totalAuctions': 1 }
  });
  
  logger.auction('created', auction.auctionId, {
    userId,
    title,
    category,
    startingBid
  });
  
  // Return only public fields
  return {
    auctionId: auction.auctionId,
    title: auction.title,
    status: auction.status,
    createdAt: auction.createdAt
  };
};


const getActiveAuctions = async (queryParams = {}) => {
  const {
    category,
    condition,
    type,
    minPrice,
    maxPrice,
    minBids,
    specialFeature, // "reserve" | "buyNow"
    status = "active", // "active" | "pending" | "ended" | "all"
    time = "any", // "any" | "nextHour" | "next6h" | "next24h" | "next7d"
    sortBy = "endingsoon", // normalized to lowercase by route
    order = "asc",
    page = 1,
    limit = 20,
    search,
  } = queryParams;

  const now = new Date();

  // 🔹 Map normalized lowercase sort values → internal camelCase keys
  const sortMap = {
    newest: "newest",
    oldest: "oldest",
    endingsoon: "endingSoon",
    pricelow: "priceLow",
    pricehigh: "priceHigh",
    mostbids: "mostBids",
    mostviews: "mostViews",
  };

  const normalizedSortBy = sortMap[sortBy] || "endingSoon";

  // Build base query
  const query = {};

  // Status filtering
  if (status !== "all") {
    if (status === "active") {
      query.status = "active";
      query["timing.endTime"] = { $gt: now };
    } else if (status === "pending") {
      query.status = "pending";
      query["timing.startTime"] = { $gt: now };
    } else if (status === "ended") {
      query.status = "ended";
      query["timing.endTime"] = { $lte: now };
    }
  } else {
    query.status = { $ne: "draft" };
  }

  // Category filter
  if (category) query.category = category;

  // Condition filter
  if (condition) query["specifications.condition"] = condition;

  // Type filter
  if (type) query.type = type;

  // Special features
  if (specialFeature === "reserve") query["pricing.reservePrice"] = { $exists: true, $gt: 0 };
  if (specialFeature === "buyNow") query["pricing.buyNowPrice"] = { $exists: true, $gt: 0 };

  // Minimum bids
  if (minBids) query["bidding.totalBids"] = { $gte: parseInt(minBids) };

  // Price range
  if (minPrice !== undefined || maxPrice !== undefined) {
    query["pricing.currentBid"] = {};
    if (minPrice !== undefined) query["pricing.currentBid"].$gte = parseFloat(minPrice);
    if (maxPrice !== undefined) query["pricing.currentBid"].$lte = parseFloat(maxPrice);
  }

  // Time range filter
  if (time !== "any") {
    const ranges = {
      nexthour: 60 * 60 * 1000,
      next6h: 6 * 60 * 60 * 1000,
      next24h: 24 * 60 * 60 * 1000,
      next7d: 7 * 24 * 60 * 60 * 1000,
    };
    const future = new Date(now.getTime() + ranges[time.toLowerCase()]);
    query["timing.startTime"] = { $lte: future };
  }

  // Search (title & description)
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Sorting
  let sortOptions = {};
  switch (normalizedSortBy) {
    case "newest":
      sortOptions.createdAt = order === "asc" ? 1 : -1;
      break;
    case "oldest":
      sortOptions.createdAt = order === "asc" ? -1 : 1;
      break;
    case "endingSoon":
      sortOptions["timing.endTime"] = order === "asc" ? 1 : -1;
      break;
    case "priceLow":
      sortOptions["pricing.currentBid"] = 1;
      break;
    case "priceHigh":
      sortOptions["pricing.currentBid"] = -1;
      break;
    case "mostBids":
      sortOptions["bidding.totalBids"] = -1;
      break;
    case "mostViews":
      sortOptions["analytics.views"] = -1;
      break;
    default:
      sortOptions["timing.endTime"] = 1;
  }

  // Pagination
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, parseInt(limit));
  const skip = (p - 1) * l;

  // Execute query
  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(l)
      .populate("seller.userId", SELLER_PUBLIC_FIELDS)
      .select("-blockchain -moderation -watchers"),
    Auction.countDocuments(query),
  ]);

  // Add time remaining to each auction
  const auctionsWithTimeRemaining = auctions.map((auction) => {
    const obj = auction.toObject();
    const endTime = new Date(auction.timing.endTime);
    const diff = endTime - now;
    obj.timeRemaining = {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      total: diff,
    };
    return obj;
  });

  // Available categories & conditions
  const [categories, conditions] = await Promise.all([
    Auction.distinct("category", { status: { $ne: "draft" } }),
    Auction.distinct("specifications.condition", { status: { $ne: "draft" } }),
  ]);

  // Dynamic price range
  const priceRange = await Auction.aggregate([
    { $match: { status: { $ne: "draft" } } },
    {
      $group: {
        _id: null,
        minPrice: { $min: "$pricing.currentBid" },
        maxPrice: { $max: "$pricing.currentBid" },
      },
    },
  ]);

  return {
    auctions: auctionsWithTimeRemaining,
    pagination: {
      page: p,
      limit: l,
      total,
      pages: Math.ceil(total / l),
    },
    filters: {
      availableCategories: categories,
      availableConditions: conditions,
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
    },
    searchQuery: search || null,
  };
};

const getAuctionById = async (auctionId, userId) => {
  const query = resolveAuctionQuery(auctionId);
  const auction = await Auction.findOne(query)
    .populate('seller.userId', 'anonymousId profile.reputation profile.memberSince')
    .populate('bidding.highestBidder.userId', 'anonymousId');

  if (!auction) throw new ApiError(404, 'Auction not found');

  const isOwner = userId && auction.seller.userId.toString() === userId.toString();

  // Restriction logic based on status
  switch (auction.status) {
    case "draft":
      if (!isOwner) throw new ApiError(403, "You are not allowed to view this auction");
      break;

    case "pending":
      // Everyone can view
      break;

    case "active":
      // Everyone can view
      break;

    case "ended":
      // Everyone can view
      break;

    case "cancelled":
      if (!isOwner) {
        // If you want cancelled auctions hidden from non-owners, uncomment below:
        // throw new ApiError(403, "You are not allowed to view this auction");
      }
      break;

    case "suspended":
      if (!isOwner) {
        const user = userId ? await User.findById(userId) : null;
        const isModerator = user?.roles?.includes("moderator") || user?.roles?.includes("admin");
        if (!isModerator) throw new ApiError(403, "You are not allowed to view this auction");
      }
      break;

    default:
      throw new ApiError(403, "Invalid auction status");
  }

  // Increment views only for non-owners
  if (!isOwner) {
    auction.analytics.views += 1;
    await auction.save();
  }

  // Convert to plain object and add real-time data
  const auctionObj = auction.toObject();
  if (userId) {
    auctionObj.isWatching = auction.watchers.some(w => w.userId.toString() === userId);
  }

  auctionObj.liveParticipants = webSocketController.getAuctionParticipantCount(auction.auctionId);
  auctionObj.liveWatchers = webSocketController.getWatcherCount(auction.auctionId);

  return auctionObj;
};

// Update auction
const updateAuction = async (auctionId, updates, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId));
  if (!auction) throw new ApiError(404, 'Auction not found');

  // Validate ownership
  assertOwnership(auction, userId);

  // Handle status updates separately
  if (updates.status) {
    const next = updates.status;
    const curr = auction.status;

    // Check rollback reason
    const rollbackMeta = {
      reason: updates.rollbackReason,      // enum (e.g. "incorrect_details")
      customMessage: updates.rollbackNote, // free text optional
    };

    assertTransitionAllowed(curr, next, rollbackMeta);

    // Pending → Active (publish auction)
    if (curr === "pending" && next === "active") {
      if (!auction.timing.startTime) {
        auction.timing.startTime = new Date();
      }
      if (!auction.timing.endTime) {
        const duration = auction.timing.duration || 24; // default: 24h
        auction.timing.endTime = new Date(
          Date.now() + duration * 60 * 60 * 1000
        );
      }
    }

    // Rollback handling
    if (
      (curr === "pending" && next === "draft") ||
      (curr === "active" && next === "pending")
    ) {
      auction.rollbacks.push({
        from: curr,
        to: next,
        reason: rollbackMeta.reason,
        customMessage: rollbackMeta.customMessage,
        changedBy: userId,
        changedAt: new Date(),
      });
    }

    auction.status = next;
    delete updates.status; // prevent overwriting via generic update
    delete updates.rollbackReason;
    delete updates.rollbackNote;
  }

  // Prevent editing certain fields after activation
  if (auction.status === "active") {
    delete updates.startTime;
    delete updates.seller;
    delete updates.title; // lock core fields
    delete updates.pricing; // lock starting price
  }

  // Apply remaining updates
  Object.assign(auction, updates);
  await auction.save();

  logger.auction("updated", auction.auctionId, {
    userId,
    updates: Object.keys(updates),
  });

  return auction.populate("seller.userId", SELLER_PUBLIC_FIELDS);
};


// Delete auction
const deleteAuction = async (auctionId, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId));
  
  if (!auction) throw new ApiError(404, 'Auction not found');
  
  assertOwnership(auction, userId);
  assertEditableBeforeStart(auction);
  
  await Auction.deleteOne({ _id: auction._id });
  
  // Update user's auction count
  await User.findByIdAndUpdate(userId, {
    $inc: { 'profile.totalAuctions': -1 }
  });
  
  logger.auction('deleted', auction.auctionId, {
    userId
  });
  
  return { success: true };
};


// Close an auction
const closeAuction = async (auctionId, userId, forceClose = false) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const auction = await Auction.findOne(resolveAuctionQuery(auctionId))
      .populate('seller.userId', 'id anonymousId')
      .populate('bidding.highestBidder.userId', 'id anonymousId')
      .session(session);
    
    // Validations
    if (!auction) throw new ApiError(404, 'Auction not found');
    
    // Check ownership
    assertOwnership(auction, userId);
    
    if (auction.status !== 'active') throw new ApiError(400, 'Auction is not active');
    
    const now = new Date();
    if (now < auction.timing.endTime && !forceClose) {
      throw new ApiError(400, 'Auction has not ended yet');
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
      userId,
      winner: auction.winner?.anonymousId
    });
    
    return auction;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
};

// Confirm item receipt
const confirmReceipt = async (auctionId, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId))
    .populate('seller.userId', 'anonymousId walletAddress')
    .populate('winner.userId', 'anonymousId');
  
  if (!auction || !auction.winner) throw new ApiError(404, 'Auction not found or has no winner');
  
  if (auction.winner.userId.toString() !== userId) throw new ApiError(403, 'Not the auction winner');
  
  if (auction.status !== 'ended') throw new ApiError(400, 'Auction must be ended before confirming receipt');
  
  // Calculate fees and payout
  const platformFee = auction.winner.winningBid * 0.03; // 3% fee
  const payoutAmount = auction.winner.winningBid - platformFee;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Create platform fee transaction
    const feeTransaction = new TokenTransaction({
      type: 'platform_fee',
      user: {
        userId: auction.seller.userId,
        walletAddress: auction.seller.walletAddress,
        anonymousId: auction.seller.anonymousId
      },
      amount: -platformFee,
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
      status: 'confirmed'
    });
    
    // Create payout transaction
    const payoutTransaction = new TokenTransaction({
      type: 'auction_payout',
      user: {
        userId: auction.seller.userId,
        walletAddress: auction.seller.walletAddress,
        anonymousId: auction.seller.anonymousId
      },
      amount: payoutAmount,
      relatedTo: {
        type: 'auction',
        id: auction.auctionId,
        reference: auction._id
      },
      status: 'confirmed'
    });
    
    // Save transactions
    await Promise.all([feeTransaction.save({ session }), payoutTransaction.save({ session })]);
    
    // Update seller's balance
    const seller = await User.findById(auction.seller.userId).session(session);
    seller.balance += payoutAmount;
    await seller.save({ session });
    
    // Update auction status
    auction.status = 'completed';
    auction.completedAt = new Date();
    await auction.save({ session });
    
    await session.commitTransaction();
    
    // Send notifications
    await notificationService.sendNotification({
      recipient: {
        userId: auction.seller.userId,
        anonymousId: auction.seller.anonymousId
      },
      type: 'payment_received',
      priority: 'high',
      title: 'Payment Received',
      message: `Payment of ${payoutAmount} WKC has been released for "${auction.title}".`,
      data: {
        auctionId: auction.auctionId,
        amount: payoutAmount,
        fee: platformFee
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    });
    
    logger.auction('receipt_confirmed', auction.auctionId, {
      winnerId: userId,
      sellerId: auction.seller.userId,
      amount: payoutAmount,
      fee: platformFee
    });
    
    return {
      auctionId: auction.auctionId,
      payoutAmount,
      platformFee,
      completedAt: auction.completedAt
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
};

// Update delivery info
const updateDeliveryInfo = async (auctionId, deliveryData, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId));
  
  if (!auction) throw new ApiError(404, 'Auction not found');
  
  assertOwnership(auction, userId);
  
  if (auction.status !== 'ended') throw new ApiError(400, 'Auction must be ended before updating delivery info');
  
  // Update shipping info
  auction.shipping.trackingNumber = deliveryData.trackingNumber;
  auction.shipping.carrier = deliveryData.carrier;
  auction.shipping.estimatedDelivery = deliveryData.estimatedDelivery;
  
  await auction.save();
  
  // Notify buyer
  if (auction.winner) {
    await notificationService.sendNotification({
      recipient: {
        userId: auction.winner.userId,
        anonymousId: auction.winner.anonymousId
      },
      type: 'delivery_updated',
      priority: 'medium',
      title: 'Delivery Information Updated',
      message: `Tracking information has been updated for "${auction.title}".`,
      data: {
        auctionId: auction.auctionId,
        trackingNumber: deliveryData.trackingNumber,
        carrier: deliveryData.carrier,
        estimatedDelivery: deliveryData.estimatedDelivery
      },
      channels: {
        inApp: { enabled: true },
        email: { enabled: true }
      }
    });
  }
  
  logger.auction('delivery_updated', auction.auctionId, {
    sellerId: userId,
    trackingNumber: deliveryData.trackingNumber,
    carrier: deliveryData.carrier
  });
  
  return {
    auctionId: auction.auctionId,
    shipping: auction.shipping
  };
};


// Get user auctions with enhanced filtering (pure controller function)
const getUserAuctions = async (userId, rawQuery) => {
  const { 
    status, 
    sortBy, 
    order = 'desc', 
    page = 1, 
    limit = 20,
    type,
    condition,
    category,
    hasBids,
    hasWinner
  } = rawQuery;
  
  const query = { "seller.userId": userId };
  
  // Filter by status
  if (status) {
    query.status = status;
  }
  
  // Filter by type
  if (type) {
    query.type = type;
  }
  
  // Filter by condition
  if (condition) {
    query['specifications.condition'] = condition;
  }
  
  // Filter by category
  if (category) {
    query.category = category;
  }
  
  // Filter by bids
  if (hasBids === 'true') {
    query['bidding.totalBids'] = { $gt: 0 };
  } else if (hasBids === 'false') {
    query['bidding.totalBids'] = 0;
  }
  
  // Filter by winner
  if (hasWinner === 'true') {
    query['winner.userId'] = { $exists: true };
  } else if (hasWinner === 'false') {
    query['winner.userId'] = { $exists: false };
  }
  
  // Sorting options
  let sortOptions = {};
  switch (sortBy) {
    case "newest":
      sortOptions.createdAt = order === "asc" ? 1 : -1;
      break;
    case "endingSoon":
      sortOptions["timing.endTime"] = order === "asc" ? 1 : -1;
      break;
    case "highestBids":
      sortOptions["pricing.currentBid"] = order === "asc" ? 1 : -1;
      break;
    case "mostViews":
      sortOptions["analytics.views"] = order === "asc" ? 1 : -1;
      break;
    default:
      sortOptions.createdAt = -1; // default newest first
  }
  
  // Pagination
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, parseInt(limit));
  const skip = (p - 1) * l;
  
  const [auctions, total] = await Promise.all([
    Auction.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(l)
      .populate('seller.userId', SELLER_PUBLIC_FIELDS),
    Auction.countDocuments(query)
  ]);
  
  return {
    auctions,
    pagination: { 
      page: p, 
      limit: l, 
      total, 
      pages: Math.ceil(total / l) 
    },
    filters: { 
      status, 
      type, 
      condition, 
      category, 
      hasBids, 
      hasWinner 
    }
  };
};

// Get seller auctions (only pending & active)
const getSellerAuctions = async (userId) => {
  const auctions = await Auction.find({
    'seller.userId': userId,
    status: { $in: ['pending', 'active'] }
  })
    .sort({ createdAt: -1 })
    .populate('seller.userId', 'anonymousId profile.reputation')
    .populate('winner.userId', 'anonymousId');

  return auctions;
};



// Get won auctions
const getWonAuctions = async (userId) => {
  const auctions = await Auction.find({
    'winner.userId': userId,
    status: 'ended'
  })
    .populate('seller.userId', 'anonymousId profile.reputation')
    .sort({ 'winner.wonAt': -1 });

  return auctions;
};


// Add watcher to auction
const addWatcher = async (auctionId, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId));
  if (!auction) throw new ApiError(404, 'Auction not found');
  
  await auction.addWatcher(userId);
  return { success: true };
};

// Remove watcher from auction
const removeWatcher = async (auctionId, userId) => {
  const auction = await Auction.findOne(resolveAuctionQuery(auctionId));
  if (!auction) throw new ApiError(404, 'Auction not found');
  
  await auction.removeWatcher(userId);
  return { success: true };
};

// Auction Controller

const getWatchlist = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [auctions, total] = await Promise.all([
    Auction.find({ watchers: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("seller.userId", "anonymousId profile.reputation")
      .select("-seller.walletAddress -blockchain -moderation"),
    Auction.countDocuments({ watchers: userId }),
  ]);

  const auctionsWithFlag = auctions.map((auction) => ({
    ...auction.toObject(),
    isWatching: true,
  }));

  return {
    auctions: auctionsWithFlag,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};


module.exports = {
  createAuction,
  getAuctionById,
  updateAuction,
  deleteAuction,
  closeAuction,
  confirmReceipt,
  updateDeliveryInfo,
  getUserAuctions,
  getSellerAuctions,
  getWonAuctions,
  addWatcher,
  removeWatcher,
  getWatchlist,
  getActiveAuctions // Add the new function to exports
};