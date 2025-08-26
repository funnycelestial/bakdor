// controllers/webSocketController.js
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Auction = require('../models/auctionModel');
const Bid = require('../models/bidModel');
const logger = require('../utils/logger');

class WebSocketController {
  constructor() {
    this.connectedUsers = new Map();
    this.auctionRooms = new Map();
    this.userSockets = new Map();
  }

  // Initialize WebSocket server
  initialize(io) {
    this.io = io;
    
    // Authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user || user.status !== 'active') {
          return next(new Error('Authentication error: Invalid user'));
        }

        socket.userId = user._id.toString();
        socket.anonymousId = user.anonymousId;
        socket.walletAddress = user.walletAddress;
        
        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
      }
    });

    // Handle connections
    io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket controller initialized');
  }

  handleConnection(socket) {
    logger.info(`User connected: ${socket.anonymousId} (${socket.userId})`);
    
    // Store connected user
    this.connectedUsers.set(socket.userId, {
      socketId: socket.id,
      anonymousId: socket.anonymousId,
      walletAddress: socket.walletAddress,
      connectedAt: new Date(),
      activeRooms: new Set()
    });

    this.userSockets.set(socket.id, socket);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to The Backdoor',
      anonymousId: socket.anonymousId,
      timestamp: new Date()
    });

    // Handle auction room events
    socket.on('join_auction', (auctionId) => {
      this.handleJoinAuction(socket, auctionId);
    });

    socket.on('leave_auction', (auctionId) => {
      this.handleLeaveAuction(socket, auctionId);
    });

    // Handle bidding events
    socket.on('place_bid', (data) => {
      this.handlePlaceBid(socket, data);
    });

    // Handle watching events
    socket.on('watch_auction', (auctionId) => {
      this.handleWatchAuction(socket, auctionId);
    });

    socket.on('unwatch_auction', (auctionId) => {
      this.handleUnwatchAuction(socket, auctionId);
    });

    // Handle chat/messaging
    socket.on('auction_message', (data) => {
      this.handleAuctionMessage(socket, data);
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on('typing_stop', (data) => {
      this.handleTypingStop(socket, data);
    });

    // Handle user status updates
    socket.on('update_status', (status) => {
      this.handleStatusUpdate(socket, status);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  handleJoinAuction(socket, auctionId) {
    try {
      socket.join(`auction_${auctionId}`);
      
      // Track auction room participants
      if (!this.auctionRooms.has(auctionId)) {
        this.auctionRooms.set(auctionId, new Set());
      }
      this.auctionRooms.get(auctionId).add(socket.userId);

      // Update user's active rooms
      const user = this.connectedUsers.get(socket.userId);
      if (user) {
        user.activeRooms.add(auctionId);
      }

      // Notify others in the room
      socket.to(`auction_${auctionId}`).emit('user_joined_auction', {
        anonymousId: socket.anonymousId,
        timestamp: new Date(),
        participantCount: this.auctionRooms.get(auctionId).size
      });

      // Send current auction data
      this.sendAuctionData(socket, auctionId);

      logger.info(`User ${socket.anonymousId} joined auction ${auctionId}`);
    } catch (error) {
      logger.error('Error joining auction room:', error);
      socket.emit('error', { message: 'Failed to join auction room' });
    }
  }

  handleLeaveAuction(socket, auctionId) {
    try {
      socket.leave(`auction_${auctionId}`);
      
      // Remove from auction room tracking
      if (this.auctionRooms.has(auctionId)) {
        this.auctionRooms.get(auctionId).delete(socket.userId);
        
        // Clean up empty rooms
        if (this.auctionRooms.get(auctionId).size === 0) {
          this.auctionRooms.delete(auctionId);
        }
      }

      // Update user's active rooms
      const user = this.connectedUsers.get(socket.userId);
      if (user) {
        user.activeRooms.delete(auctionId);
      }

      // Notify others in the room
      socket.to(`auction_${auctionId}`).emit('user_left_auction', {
        anonymousId: socket.anonymousId,
        timestamp: new Date(),
        participantCount: this.auctionRooms.get(auctionId)?.size || 0
      });

      logger.info(`User ${socket.anonymousId} left auction ${auctionId}`);
    } catch (error) {
      logger.error('Error leaving auction room:', error);
    }
  }

  handlePlaceBid(socket, data) {
    try {
      const { auctionId, amount } = data;
      
      // Broadcast bid placement to auction room
      this.io.to(`auction_${auctionId}`).emit('bid_update', {
        auctionId,
        bidder: socket.anonymousId,
        amount,
        timestamp: new Date(),
        isNewHighest: true
      });

      // Broadcast to watchers
      this.io.to(`watchers_${auctionId}`).emit('bid_update', {
        auctionId,
        bidder: socket.anonymousId,
        amount,
        timestamp: new Date()
      });

      logger.auction('bid_placed_ws', auctionId, {
        bidder: socket.anonymousId,
        amount,
        userId: socket.userId
      });
    } catch (error) {
      logger.error('Error handling bid placement:', error);
      socket.emit('error', { message: 'Failed to process bid' });
    }
  }

  handleWatchAuction(socket, auctionId) {
    try {
      socket.join(`watchers_${auctionId}`);
      
      // Notify auction room about new watcher
      this.io.to(`auction_${auctionId}`).emit('auction_watched', {
        auctionId,
        watcherCount: this.getWatcherCount(auctionId),
        timestamp: new Date()
      });

      logger.info(`User ${socket.anonymousId} is watching auction ${auctionId}`);
    } catch (error) {
      logger.error('Error watching auction:', error);
    }
  }

  handleUnwatchAuction(socket, auctionId) {
    try {
      socket.leave(`watchers_${auctionId}`);
      
      // Notify auction room about watcher leaving
      this.io.to(`auction_${auctionId}`).emit('auction_unwatched', {
        auctionId,
        watcherCount: this.getWatcherCount(auctionId),
        timestamp: new Date()
      });

      logger.info(`User ${socket.anonymousId} stopped watching auction ${auctionId}`);
    } catch (error) {
      logger.error('Error unwatching auction:', error);
    }
  }

  handleAuctionMessage(socket, data) {
    try {
      const { auctionId, message } = data;
      
      // Broadcast message to auction room
      socket.to(`auction_${auctionId}`).emit('auction_message', {
        auctionId,
        sender: socket.anonymousId,
        message,
        timestamp: new Date()
      });

      logger.info(`Message sent in auction ${auctionId} by ${socket.anonymousId}`);
    } catch (error) {
      logger.error('Error handling auction message:', error);
    }
  }

  handleTypingStart(socket, data) {
    const { auctionId } = data;
    socket.to(`auction_${auctionId}`).emit('user_typing', {
      anonymousId: socket.anonymousId,
      isTyping: true,
      timestamp: new Date()
    });
  }

  handleTypingStop(socket, data) {
    const { auctionId } = data;
    socket.to(`auction_${auctionId}`).emit('user_typing', {
      anonymousId: socket.anonymousId,
      isTyping: false,
      timestamp: new Date()
    });
  }

  handleStatusUpdate(socket, status) {
    try {
      // Update user status and broadcast to relevant rooms
      const user = this.connectedUsers.get(socket.userId);
      if (user) {
        user.status = status;
        
        // Broadcast status to all rooms user is in
        user.activeRooms.forEach(auctionId => {
          socket.to(`auction_${auctionId}`).emit('user_status_update', {
            anonymousId: socket.anonymousId,
            status,
            timestamp: new Date()
          });
        });
      }
    } catch (error) {
      logger.error('Error handling status update:', error);
    }
  }

  handleDisconnection(socket, reason) {
    logger.info(`User disconnected: ${socket.anonymousId} (${socket.userId}), reason: ${reason}`);
    
    // Remove from connected users
    this.connectedUsers.delete(socket.userId);
    this.userSockets.delete(socket.id);
    
    // Clean up auction rooms
    for (const [auctionId, participants] of this.auctionRooms.entries()) {
      if (participants.has(socket.userId)) {
        participants.delete(socket.userId);
        
        // Notify others in the room
        socket.to(`auction_${auctionId}`).emit('user_left_auction', {
          anonymousId: socket.anonymousId,
          timestamp: new Date(),
          participantCount: participants.size
        });
        
        // Clean up empty rooms
        if (participants.size === 0) {
          this.auctionRooms.delete(auctionId);
        }
      }
    }
  }

  // Public methods for external use
  broadcastToAuction(auctionId, event, data) {
    if (this.io) {
      this.io.to(`auction_${auctionId}`).emit(event, {
        ...data,
        timestamp: new Date()
      });
    }
  }

  broadcastToWatchers(auctionId, event, data) {
    if (this.io) {
      this.io.to(`watchers_${auctionId}`).emit(event, {
        ...data,
        timestamp: new Date()
      });
    }
  }

  sendToUser(userId, event, data) {
    const user = this.connectedUsers.get(userId);
    if (user && this.io) {
      this.io.to(user.socketId).emit(event, {
        ...data,
        timestamp: new Date()
      });
    }
  }

  broadcastToAll(event, data) {
    if (this.io) {
      this.io.emit(event, {
        ...data,
        timestamp: new Date()
      });
    }
  }

  // Auction-specific broadcasts
  broadcastBidUpdate(auctionId, bidData) {
    this.broadcastToAuction(auctionId, 'bid_update', bidData);
    this.broadcastToWatchers(auctionId, 'bid_update', bidData);
  }

  broadcastAuctionEnd(auctionId, endData) {
    this.broadcastToAuction(auctionId, 'auction_ended', endData);
    this.broadcastToWatchers(auctionId, 'auction_ended', endData);
  }

  broadcastAuctionExtension(auctionId, extensionData) {
    this.broadcastToAuction(auctionId, 'auction_extended', extensionData);
    this.broadcastToWatchers(auctionId, 'auction_extended', extensionData);
  }

  broadcastTokensBurned(burnData) {
    this.broadcastToAll('tokens_burned', burnData);
  }

  broadcastSystemMaintenance(message) {
    this.broadcastToAll('system_maintenance', {
      message,
      timestamp: new Date()
    });
  }

  // Utility methods
  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  getAuctionParticipantCount(auctionId) {
    return this.auctionRooms.get(auctionId)?.size || 0;
  }

  getWatcherCount(auctionId) {
    const room = this.io?.sockets.adapter.rooms.get(`watchers_${auctionId}`);
    return room ? room.size : 0;
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  async sendAuctionData(socket, auctionId) {
    try {
      const auction = await Auction.findOne({ auctionId })
        .populate('seller.userId', 'anonymousId')
        .populate('bidding.highestBidder.userId', 'anonymousId');

      if (auction) {
        socket.emit('auction_data', {
          auctionId: auction.auctionId,
          title: auction.title,
          currentBid: auction.pricing.currentBid,
          timeRemaining: Math.max(0, new Date(auction.timing.endTime) - new Date()),
          totalBids: auction.bidding.totalBids,
          participantCount: this.getAuctionParticipantCount(auctionId),
          watcherCount: this.getWatcherCount(auctionId),
          status: auction.status,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Error sending auction data:', error);
    }
  }

  // Statistics and monitoring
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeAuctions: this.auctionRooms.size,
      totalRooms: this.io?.sockets.adapter.rooms.size || 0,
      timestamp: new Date()
    };
  }

  // Admin functions
  kickUser(userId, reason = 'Admin action') {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.userSockets.get(user.socketId);
      if (socket) {
        socket.emit('kicked', { reason });
        socket.disconnect(true);
      }
    }
  }

  sendAdminMessage(message, targetUserId = null) {
    const data = {
      type: 'admin_message',
      message,
      timestamp: new Date()
    };

    if (targetUserId) {
      this.sendToUser(targetUserId, 'admin_message', data);
    } else {
      this.broadcastToAll('admin_message', data);
    }
  }
}

module.exports = new WebSocketController();