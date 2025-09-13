// routes/userRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const { auth, adminAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  login,
  getProfile,
  updateBalance,
  verifyUser,
  toggleSuspension,
  deleteAccount,
  getDashboard,
  getWatchlist,
  getUserActivity
} = require('../controllers/userController');
const User = require('../models/userModel');
const web3Service = require('../services/web3Service');
const TokenTransaction = require('../models/tokenTransactionModel');


const router = express.Router();

// @route   POST /api/v1/users/login
// @desc    Authenticate user via wallet signature and get token
// @access  Public
router.post(
  '/login',
  [
    body('walletAddress')
      .isString()
      .withMessage('Wallet address is required'),
    body('signature')
      .isString()
      .withMessage('Signature is required')
  ],
  asyncHandler(login)
);

// @route   GET /api/v1/users/me
// @desc    Get user profile with stats
// @access  Private
router.get('/me', auth, asyncHandler(getProfile));


// @route   DELETE /api/v1/users/profile
// @desc    Delete user account
// @access  Private
router.delete('/profile', auth, asyncHandler(deleteAccount));

// @route   PUT /api/v1/users/balance
// @desc    Update user balance (deposit/withdraw/etc.)
// @access  Private
router.put('/balance', auth, asyncHandler(updateBalance));


// @route   PUT /api/v1/users/balance/refresh
// @desc    Refresh and sync user token balance from blockchain (WKC only)
// @access  Private
router.put(
  "/balance/refresh",
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Find user
    const user = await User.findById(userId);
    if (!user || !user.walletAddress) {
      return res.status(400).json({ message: "Wallet not linked" });
    }

    // 🔗 Fetch WKC token balance from chain
    const onChainBalance = await web3Service.getTokenBalance(user.walletAddress);

    // Compute difference vs stored balance
    const difference = onChainBalance - user.balance.total;

    // Only log a transaction if there's an actual difference
    if (difference !== 0) {
      const txn = new TokenTransaction({
        user: {
          userId: user._id,
          walletAddress: user.walletAddress,
          anonymousId: user.anonymousId,
        },
        type: "sync",
        amount: difference,
        status: "success",
        metadata: {
          description: "Balance refreshed from blockchain",
          initiatedBy: "system",
          source: "blockchain",
        },
      });

      await txn.save(); // 🔥 triggers pre('save') to auto-generate transactionId

      // Update user balance
      user.balance.available = onChainBalance;
      user._recomputeTotal();
      await user.save();
    }

    res.json({
      success: true,
      balance: user.balance,
      message: "Wikicat balance refreshed from blockchain",
    });
  })
);


// @route   PUT /api/v1/users/:userId/verify
// @desc    Verify user account (Admin only)
// @access  Private/Admin
router.put(
  '/:userId/verify',
  auth,
  adminAuth,
  [
    param('userId').isMongoId().withMessage('Invalid user ID')
  ],
  asyncHandler(verifyUser)
);

// @route   PUT /api/v1/users/:userId/suspend
// @desc    Toggle user suspension status (Admin only)
// @access  Private/Admin
router.put(
  '/:userId/suspend',
  auth,
  adminAuth,
  [
    param('userId').isMongoId().withMessage('Invalid user ID')
  ],
  asyncHandler(toggleSuspension)
);

// @route   GET /api/v1/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', auth, asyncHandler(getDashboard));

// @route   GET /api/v1/users/watchlist
// @desc    Get user's watched auctions
// @access  Private
router.get('/watchlist', auth, asyncHandler(getWatchlist));

// @route   GET /api/v1/users/activities
// @desc    Get user's watched auctions
// @access  Private
router.get('/activities', auth, asyncHandler(getUserActivity));

// Export the router using CommonJS to ensure compatibility
module.exports = router;