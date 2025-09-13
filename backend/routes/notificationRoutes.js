// routes/notificationRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { auth } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors, NotFoundError } = require('../middleware/errorHandler');
const { socketService } = require('../services/socketService');
const logger = require('../utils/logger');

/* ======================
   VALIDATORS
====================== */
const notificationValidators = {
  getNotifications: [
    query('type').optional().isString(),
    query('read').optional().isBoolean(),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  markAsRead: [
    param('notificationId').isString().withMessage('Invalid notification ID')
  ],
  subscribe: [
    body('type')
      .isIn(['bid_updates', 'auction_end', 'escrow_updates', 'security_alerts'])
      .withMessage('Invalid notification type'),
    body('channels')
      .isArray().withMessage('Channels must be an array'),
    body('channels.*')
      .isIn(['inApp', 'email', 'push', 'sms'])
      .withMessage('Invalid channel')
  ],
  unsubscribe: [
    param('type')
      .isIn(['bid_updates', 'auction_end', 'escrow_updates', 'security_alerts'])
      .withMessage('Invalid notification type')
  ]
};

/* ======================
   ROUTES
====================== */
const router = express.Router();

// GET /api/v1/notifications
router.get('/', [auth, ...notificationValidators.getNotifications], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  const { type, read, priority, page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = { 'recipient.userId': req.user.userId };
  if (type) query.type = type;
  if (read !== undefined) query['channels.inApp.read'] = read === 'true';
  if (priority) query.priority = priority;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(query),
    Notification.countDocuments({
      'recipient.userId': req.user.userId,
      'channels.inApp.read': false
    })
  ]);
  res.json({
    success: true,
    message: 'Notifications retrieved successfully',
    data: {
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// PUT /api/v1/notifications/:notificationId/read
router.put('/:notificationId/read', [auth, ...notificationValidators.markAsRead], asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    notificationId: req.params.notificationId,
    'recipient.userId': req.user.userId
  });
  if (!notification) throw new NotFoundError('Notification not found');
  await notification.markAsRead();
  if (socketService) {
    socketService.sendToUser(req.user.userId, 'notification_read', {
      notificationId: notification.notificationId
    });
  }
  logger.notification('marked_read', req.user.userId, {
    notificationId: notification.notificationId,
    type: notification.type
  });
  res.json({
    success: true,
    message: 'Notification marked as read',
    data: null
  });
}));

// PUT /api/v1/notifications/read-all
router.put('/read-all', auth, asyncHandler(async (req, res) => {
  const result = await Notification.markAllAsRead(req.user.userId);
  logger.notification('marked_all_read', req.user.userId, {
    markedCount: result.modifiedCount
  });
  res.json({
    success: true,
    message: 'All notifications marked as read',
    data: { markedCount: result.modifiedCount }
  });
}));

// POST /api/v1/notifications/subscribe
router.post('/subscribe', [auth, ...notificationValidators.subscribe], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors)
    });
  }
  const { type, channels } = req.body;
  const user = await User.findById(req.user.userId);
  if (!user) throw new NotFoundError('User not found');
  channels.forEach(channel => {
    if (user.preferences.notifications[channel] !== undefined) {
      user.preferences.notifications[channel] = true;
    }
  });
  await user.save();
  logger.notification('subscribed', req.user.userId, { type, channels });
  res.json({
    success: true,
    message: 'Subscription updated successfully',
    data: { type, channels, preferences: user.preferences.notifications }
  });
}));

// DELETE /api/v1/notifications/unsubscribe/:type
router.delete('/unsubscribe/:type', [auth, ...notificationValidators.unsubscribe], asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) throw new NotFoundError('User not found');
  Object.keys(user.preferences.notifications).forEach(channel => {
    if (channel !== 'language' && channel !== 'timezone') {
      user.preferences.notifications[channel] = false;
    }
  });
  await user.save();
  logger.notification('unsubscribed', req.user.userId, { type: req.params.type });
  res.json({
    success: true,
    message: 'Unsubscribed successfully',
    data: null
  });
}));

module.exports = router;