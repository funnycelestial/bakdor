const mongoose = require('mongoose');
const Bid = require('../models/bidModel');
const Auction = require('../models/auctionModel');
const User = require('../models/userModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const webSocketController = require('./webSocketController');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Constants for anti-sniping and fraud detection
const ANTI_SNIPING_EXTENSION = 30; // Extend auction by 30 sec if last-minute bid
const FRAUD_RULES = {
  MIN_BID_INCREASE: 0.05, // 5% minimum bid increment
  TOO_FAST_BIDS: 5000, // 5 seconds between bids (ms)
};

// Escrow Service Integration (commented out as escrow is implemented separately)

const escrowBidTokens = async (bid) => {
  try {
    const user = await User.findById(bid.bidder.userId);
    user.escrowedBalance = (user.escrowedBalance || 0) + bid.amount;
    user.balance -= bid.amount;
    await user.save();
    return true;
  } catch (error) {
    console.error('Escrow failed:', error);
    throw error;
  }
};

// @route   POST /api/v1/bids/auctions/:id
// @desc    Place bid with real-time updates and validation
// @access  Private
const placeBid = asyncHandler(async (req, res) => {
  let bid; // declare outside try for cleanup
  const { amount, isAutoBid = false, maxAmount, increment } = req.body;
  const auctionId = req.params.id;
  const userId = req.user.userId;
  
  // Find auction
  const auction = await Auction.findById(auctionId);
  if (!auction) {
    return res.status(404).json({
      success: false,
      message: 'Auction not found',
      data: null
    });
  }
  
  // Check if auction is active
  if (auction.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Auction is not active',
      data: null
    });
  }
  
  // Check if auction has ended
  if (new Date() >= auction.timing.endTime) {
    return res.status(400).json({
      success: false,
      message: 'Auction has ended',
      data: null
    });
  }
  
  // Check if user is not the seller
  if (auction.seller.userId.toString() === userId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot bid on your own auction',
      data: null
    });
  }
  
  // Validate bid amount using FRAUD_RULES
  const minBidAmount = Math.max(
    auction.pricing.currentBid + (auction.bidding.bidIncrement || 1),
    auction.pricing.currentBid * (1 + FRAUD_RULES.MIN_BID_INCREASE)
  );
  
  if (amount < minBidAmount) {
    return res.status(400).json({
      success: false,
      message: `Bid must be at least ${minBidAmount} WKC`,
      data: null
    });
  }
  
  // Anti-spam: Check for rapid bidding using FRAUD_RULES
  const lastUserBid = await Bid.findOne({ 
    'bidder.userId': userId, 
    'auction.auctionRef': auction._id 
  }).sort({ 'timing.placedAt': -1 });
  
  if (lastUserBid && (Date.now() - lastUserBid.timing.placedAt.getTime()) < FRAUD_RULES.TOO_FAST_BIDS) {
    return res.status(429).json({
      success: false,
      message: `Please wait ${FRAUD_RULES.TOO_FAST_BIDS / 1000} seconds between bids`,
      data: null
    });
  }
  
  // Create bid
  bid = new Bid({
    auction: {
      auctionId: auction.auctionId,
      auctionRef: auction._id
    },
    bidder: {
      userId: req.user.userId,
      anonymousId: req.user.anonymousId,
      walletAddress: req.user.walletAddress
    },
    amount,
    autoBid: {
      isAutoBid,
      maxAmount,
      increment,
      isActive: isAutoBid
    },
    metadata: {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      bidSource: 'web'
    },
    validation: {
      riskScore: amount > auction.pricing.currentBid * 2 ? 30 : 0,
      flagged: amount > auction.pricing.currentBid * 3
    }
  });
  
  await bid.save();
  
  // Simulate blockchain transaction (in production, integrate with actual blockchain)
  const lockResult = {
    transactionHash: `0x${require('crypto').randomBytes(32).toString('hex')}`,
    blockNumber: Math.floor(Math.random() * 1000000),
    gasUsed: Math.floor(Math.random() * 100000)
  };
  
  // Update bid with blockchain info
  bid.blockchain.transactionHash = lockResult.transactionHash;
  bid.blockchain.blockNumber = lockResult.blockNumber;
  bid.blockchain.isOnChain = true;
  bid.status = 'active';
  await bid.save();
  
  // Use finalizeBidPlacement to handle auction updates and anti-sniping
  const finalizeResult = await finalizeBidPlacement(bid);
  
  // Create token transaction record
  const tokenTransaction = new TokenTransaction({
    type: 'bid_lock',
    user: {
      userId: req.user.userId,
      walletAddress: req.user.walletAddress,
      anonymousId: req.user.anonymousId
    },
    amount,
    blockchain: {
      transactionHash: lockResult.transactionHash,
      blockNumber: lockResult.blockNumber,
      gasUsed: lockResult.gasUsed,
      isConfirmed: true
    },
    relatedTo: {
      type: 'bid',
      id: bid.bidId,
      reference: bid._id
    },
    status: 'confirmed'
  });
  await tokenTransaction.save();
  
  // Broadcast bid update via WebSocket
  webSocketController.broadcastBidUpdate(auction.auctionId, {
    bidId: bid.bidId,
    bidder: bid.bidder.anonymousId,
    amount: bid.amount,
    isNewHighest: true,
    transactionHash: lockResult.transactionHash
  });
  
  // Send notification to auction watchers
  const watchers = await User.find({
    _id: { $in: auction.watchers.map(w => w.userId) }
  });
  
  for (const watcher of watchers) {
    if (watcher._id.toString() !== userId) {
      await notificationService.sendNotification({
        recipient: {
          userId: watcher._id,
          anonymousId: watcher.anonymousId
        },
        type: 'bid_placed',
        priority: 'medium',
        title: 'New Bid on Watched Auction',
        message: `New bid of ${amount} WKC placed on "${auction.title}"`,
        data: {
          auctionId: auction.auctionId,
          bidAmount: amount,
          bidder: bid.bidder.anonymousId
        },
        channels: {
          inApp: { enabled: true }
        }
      });
    }
  }
  
  logger.auction('bid_placed', auction.auctionId, {
    bidId: bid.bidId,
    userId: req.user.userId,
    amount,
    transactionHash: lockResult.transactionHash
  });
  
  res.status(201).json({
    success: true,
    message: 'Bid placed successfully',
    data: {
      bid: {
        id: bid._id,
        bidId: bid.bidId,
        amount: bid.amount,
        status: bid.status,
        placedAt: bid.timing.placedAt,
        transactionHash: lockResult.transactionHash
      },
      auction: {
        currentBid: auction.pricing.currentBid,
        totalBids: auction.bidding.totalBids,
        endTime: finalizeResult.extendedEndTime || auction.timing.endTime
      }
    }
  });
});

const finalizeBidPlacement = async (bid) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const auction = await Auction.findById(bid.auction.auctionRef).session(session);
    if (!auction) throw new Error('Auction not found during bid finalization');
    
    // Anti-sniping extension
    const timeRemaining = (auction.timing.endTime - Date.now()) / 1000;
    let extendedEndTime;
    
    if (timeRemaining < ANTI_SNIPING_EXTENSION) {
      auction.timing.endTime = new Date(Date.now() + ANTI_SNIPING_EXTENSION * 1000);
      extendedEndTime = auction.timing.endTime;
    }
    
    // Mark previous highest bidder as outbid
    if (auction.bidding.highestBidder && auction.bidding.highestBidder.userId) {
      await Bid.updateMany(
        {
          'auction.auctionRef': auction._id,
          'bidder.userId': auction.bidding.highestBidder.userId,
          status: 'winning'
        },
        { status: 'outbid' },
        { session }
      );
    }
    
    // Update auction with new highest bid
    await auction.placeBid(bid.amount, {
      userId: bid.bidder.userId,
      anonymousId: bid.bidder.anonymousId,
      walletAddress: bid.bidder.walletAddress
    }, { session });
    
    // Mark current bid as winning
    await Bid.findByIdAndUpdate(
      bid._id,
      { status: 'winning' },
      { session }
    );
    
    await session.commitTransaction();
    
    return {
      newPrice: auction.pricing.currentBid,
      extendedEndTime,
      userBalance: (await User.findById(bid.bidder.userId)).balance
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Get All Bids for an Auction (Anonymous)

const getAuctionBids = async (req, res) => {
  try {
    const auctionId = req.params.auctionId;
    let auction;

    // Check if auctionId is a valid Mongo ObjectId
    if (mongoose.Types.ObjectId.isValid(auctionId)) {
      auction = await Auction.findById(auctionId);
    } else {
      // Otherwise assume it's the custom auctionId (AUC_xxxxx)
      auction = await Auction.findOne({ auctionId });
    }

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Now fetch bids by auction reference
    const bids = await Bid.find({ 'auction.auctionRef': auction._id })
      .sort({ amount: -1 })
      .select('amount createdAt') // Hide bidder info
      .lean();

    // Anonymize bids
    const anonymousBids = bids.map((bid, index) => ({
      position: index + 1,
      amount: bid.amount,
      time: bid.createdAt,
      bidder: `Bidder #${bid._id.toString().slice(-4)}`
    }));

    res.json(anonymousBids);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// Get All Bids by a User (Private)
const getUserBids = async (req, res) => {
  try {
    const bids = await Bid.find({ 'bidder.userId': req.user.id })
      .populate('auction.auctionRef', 'title pricing.currentBid timing.endTime')
      .sort({ createdAt: -1 });
    
    res.json(bids);
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// Mark Winning Bid (System-Triggered)
const setWinningBid = async (auctionId) => {
  try {
    // Find auction first to get the reference
    const auction = await Auction.findOne({ auctionId });
    if (!auction) throw new Error('Auction not found');
    
    // Find highest bid
    const winningBid = await Bid.findOne({ 'auction.auctionRef': auction._id })
      .sort({ amount: -1 });
    
    if (winningBid) {
      // Mark all bids as non-winning first
      await Bid.updateMany(
        { 'auction.auctionRef': auction._id },
        { $set: { isWinningBid: false } }
      );
      
      // Set the winner
      winningBid.isWinningBid = true;
      await winningBid.save();
      
      return winningBid;
    }
    return null;
  } catch (error) {
    console.error('Error setting winning bid:', error);
    throw error;
  }
};

// Delete Bid (Admin/Vendor)
const deleteBid = async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.bidId);
    if (!bid) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    
    const auction = await Auction.findById(bid.auction.auctionRef);
    const now = new Date();
    
    // Only allow deletion if auction hasn't started
    if (now >= auction.timing.startTime) {
      return res.status(400).json({ message: 'Cannot delete bid after auction starts' });
    }
    
    await Bid.findByIdAndDelete(req.params.bidId);
    
    res.json({ message: 'Bid deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};


// Get Highest Bid for Auction
const getHighestBid = async (req, res) => {
  try {
    const auctionParam = req.params.auctionId;

    let auction;

    // If the param is a valid ObjectId → search by _id
    if (mongoose.Types.ObjectId.isValid(auctionParam)) {
      auction = await Auction.findById(auctionParam);
    }

    // Otherwise → search by auctionId (custom string like AUC_XXXX)
    if (!auction) {
      auction = await Auction.findOne({ auctionId: auctionParam });
    }

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const bid = await Bid.findOne({ 'auction.auctionRef': auction._id })
      .sort({ amount: -1 })
      .populate('bidder.userId', 'anonymousId');

    res.json(bid || { message: 'No bids yet' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};



// Get Bid Count for Auction
const getBidCount = async (req, res) => {
  try {
    const auctionParam = req.params.auctionId;

    let auction;

    // If param looks like an ObjectId → search by _id
    if (mongoose.Types.ObjectId.isValid(auctionParam)) {
      auction = await Auction.findById(auctionParam);
    }

    // Otherwise → search by auctionId
    if (!auction) {
      auction = await Auction.findOne({ auctionId: auctionParam });
    }

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const count = await Bid.countDocuments({ 'auction.auctionRef': auction._id });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};


// Retract Bid (With Penalty)
const retractBid = async (req, res) => {
  try {
    const bidParam = req.params.bidId;

    let bid;

    // If valid ObjectId → search by _id
    if (mongoose.Types.ObjectId.isValid(bidParam)) {
      bid = await Bid.findById(bidParam);
    }

    // Otherwise → search by custom bidId
    if (!bid) {
      bid = await Bid.findOne({ bidId: bidParam });
    }

    if (!bid) return res.status(404).json({ message: 'Bid not found' });

    const auction = await Auction.findById(bid.auction.auctionRef);
    const user = await User.findById(bid.bidder.userId);

    // Validation
    if (bid.bidder.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not your bid' });
    }

    if (new Date() > auction.timing.endTime) {
      return res.status(400).json({ message: 'Cannot retract after auction ends' });
    }

    // Penalty: 10% of bid amount or fixed fee (whichever is higher)
    const penalty = Math.max(
      bid.amount * 0.1,
      0.5 // Minimum 0.5 token penalty
    );

    // Update bid
    bid.isRetracted = true;
    bid.retractionPenalty = penalty;
    await bid.save();

    // Refund user (amount - penalty)
    user.balance += (bid.amount - penalty);
    await user.save();

    // If this was the highest bid, reset auction price
    if (
      auction.bidding.highestBidder &&
      auction.bidding.highestBidder.userId.toString() === bid.bidder.userId.toString()
    ) {
      const newHighestBid = await Bid.findOne({
        'auction.auctionRef': bid.auction.auctionRef,
        isRetracted: { $ne: true },
      }).sort({ amount: -1 });

      auction.pricing.currentBid = newHighestBid?.amount || auction.pricing.startingBid;
      auction.bidding.highestBidder = newHighestBid?.bidder || null;
      await auction.save();
    }

    res.json({
      refunded: bid.amount - penalty,
      penaltyApplied: penalty,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Retraction failed: ' + error.message,
    });
  }
};

// Fraud Review Endpoints (Admin)
const flagBidReview = async (req, res) => {
  try {
    const bid = await Bid.findByIdAndUpdate(
      req.params.bidId,
      { flaggedForReview: true },
      { new: true }
    );
    
    if (!bid) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    
    res.json(bid);
  } catch (error) {
    res.status(500).json({ message: 'Error flagging bid for review: ' + error.message });
  }
};

const getSuspiciousBids = async (req, res) => {
  try {
    const bids = await Bid.find({ flaggedForReview: true })
      .populate('bidder.userId', 'anonymousId email')
      .populate('auction.auctionRef', 'title');
    
    res.json(bids);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching suspicious bids: ' + error.message });
  }
};

module.exports = {
  placeBid,
  finalizeBidPlacement,
  getAuctionBids,
  getUserBids,
  setWinningBid,
  deleteBid,
  getHighestBid,
  getBidCount,
  retractBid,
  flagBidReview,
  getSuspiciousBids,
  escrowBidTokens
};