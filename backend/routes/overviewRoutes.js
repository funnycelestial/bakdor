// routes/overviewRoutes.js
const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const overviewController = require('../controllers/overviewController');

const router = express.Router();

/* ======================
   ROUTES
====================== */

// @route   GET /api/v1/overview
// @desc    Get platform overview statistics
// @access  Private
router.get('/', auth, asyncHandler(async (req, res) => {
  const overview = await overviewController.getPlatformOverview();
  
  res.json({
    success: true,
    message: 'Platform overview retrieved successfully',
    data: overview
  });
}));

// @route   GET /api/v1/overview/health
// @desc    Get platform health status
// @access  Private
router.get('/health', auth, asyncHandler(async (req, res) => {
  const health = await overviewController.getPlatformHealth();
  
  res.json({
    success: true,
    message: 'Platform health status retrieved successfully',
    data: health
  });
}));

module.exports = router;
