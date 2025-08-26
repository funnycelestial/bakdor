// controllers/tokenTransactionController.js
import TokenTransaction from '../models/tokentransactionModel.js';
import User from '../models/userModel.js';
import Auction from '../models/auctionModel.js';
import Bid from '../models/bidModel.js';
import { initiatePayment, processPayout } from '../services/paymentService.js'; // Mock payment processor

// 1. Handle Buy-In (User → Platform)
export const buyTokens = async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    const userId = req.user.id;

    // Initiate payment (mock implementation)
    const paymentResult = await initiatePayment({
      userId,
      amount,
      currency: 'GHS',
      method: paymentMethod // 'MoMo', 'PayPal', etc.
    });

    if (!paymentResult.success) {
      return res.status(400).json({ message: 'Payment failed: ' + paymentResult.error });
    }

    // Create transaction record
    const tx = await TokenTransaction.create({
      user: userId,
      type: 'BUY_IN',
      amount,
      status: 'SUCCESS',
      paymentMethod,
      reference: paymentResult.txId
    });

    // Update user balance
    await User.findByIdAndUpdate(userId, { 
      $inc: { balance: amount } 
    });

    res.json({
      newBalance: req.user.balance + amount,
      transaction: tx
    });

  } catch (error) {
    res.status(500).json({ message: 'Token purchase failed: ' + error.message });
  }
};

// 2. Escrow Tokens on Bid Placement (Bid Middleware)
export const escrowBidTokens = async (bid) => {
  const tx = await TokenTransaction.create({
    user: bid.bidder,
    type: 'BID_PLACED',
    amount: bid.amount,
    status: 'SUCCESS',
    linkedAuction: bid.auction,
    linkedBid: bid._id
  });

  // Balance already deducted in bidController
  return tx;
};

// 3. Refund Losing Bidders (Auction Close)
// Enhanced refund function with batch processing
export const refundLosingBids = async (auctionId) => {
  const losingBids = await Bid.find({ 
    auction: auctionId,
    isWinningBid: false,
    isRetracted: false 
  });

  const bulkOps = losingBids.map(bid => ({
    updateOne: {
      filter: { _id: bid.bidder },
      update: { $inc: { balance: bid.amount } }
    }
  }));

  // Batch update user balances
  if (bulkOps.length > 0) {
    await User.bulkWrite(bulkOps);
  }

  // Create refund transactions
  const refundTxs = losingBids.map(bid => ({
    user: bid.bidder,
    type: 'BID_REFUND',
    amount: bid.amount,
    status: 'SUCCESS',
    linkedAuction: auctionId,
    linkedBid: bid._id
  }));

  await TokenTransaction.insertMany(refundTxs);
};

// Vendor token release (with escrow hold)
export const releaseTokensToVendor = async ({ auctionId, vendorId, amount, holdUntilConfirmation }) => {
  const tx = await TokenTransaction.create({
    user: vendorId,
    type: holdUntilConfirmation ? 'ESCROW_HOLD' : 'PAYOUT_VENDOR',
    amount,
    status: holdUntilConfirmation ? 'PENDING' : 'SUCCESS',
    linkedAuction: auctionId
  });

  if (!holdUntilConfirmation) {
    await User.findByIdAndUpdate(vendorId, { 
      $inc: { balance: amount } 
    });
  }
  
  return tx;
};

// 4. Pay Vendor (Delivery Confirmation)
export const payVendor = async (auctionId) => {
  const auction = await Auction.findById(auctionId);
  if (!auction.winningBidAmount) return;

  const tx = await TokenTransaction.create({
    user: auction.vendor,
    type: 'PAYOUT_VENDOR',
    amount: auction.winningBidAmount,
    status: 'SUCCESS',
    linkedAuction: auctionId
  });

  await User.findByIdAndUpdate(auction.vendor, {
    $inc: { balance: auction.winningBidAmount }
  });

  return tx;
};

// 5. Sell Tokens (Platform → User Fiat/Crypto)
export const sellTokens = async (req, res) => {
  try {
    const { amount, payoutMethod } = req.body;
    const userId = req.user.id;

    // Validate balance
    const user = await User.findById(userId);
    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient token balance' });
    }

    // Create PENDING transaction
    const tx = await TokenTransaction.create({
      user: userId,
      type: 'SELL_OUT',
      amount,
      status: 'PENDING',
      paymentMethod: payoutMethod
    });

    // Process payout (mock implementation)
    const payoutResult = await processPayout({
      userId,
      amount: amount * 0.18, // 0.18 GHS per token (from your spec)
      method: payoutMethod
    });

    if (!payoutResult.success) {
      await tx.updateOne({ status: 'FAILED' });
      return res.status(400).json({ message: 'Payout failed: ' + payoutResult.error });
    }

    // Update on success
    await Promise.all([
      tx.updateOne({ 
        status: 'SUCCESS',
        reference: payoutResult.txId 
      }),
      User.findByIdAndUpdate(userId, { 
        $inc: { balance: -amount } 
      })
    ]);

    res.json({
      newBalance: user.balance - amount,
      amountSent: amount * 0.18,
      transaction: tx
    });

  } catch (error) {
    res.status(500).json({ message: 'Token sale failed: ' + error.message });
  }
};

// 6. Get User Transaction History
export const getTransactionHistory = async (req, res) => {
  try {
    const transactions = await TokenTransaction.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate('linkedAuction', 'title')
      .populate('linkedBid', 'amount');

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch history: ' + error.message });
  }
};

// 7. Admin Balance Adjustment (Manual Override)
export const adjustBalance = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    const tx = await TokenTransaction.create({
      user: userId,
      type: 'ADMIN_ADJUST',
      amount: Math.abs(amount),
      status: 'SUCCESS',
      reference: reason
    });

    await User.findByIdAndUpdate(userId, {
      $inc: { balance: amount }
    });

    res.json(tx);
  } catch (error) {
    res.status(500).json({ message: 'Adjustment failed: ' + error.message });
  }
};