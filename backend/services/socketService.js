const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.auctionRooms = new Map();
  }

  initialize(io) {
    this.io = io;
    this.setupSocketHandlers();
    logger.info('Socket service initialized');
  }

  setupSocketHandlers() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          return next(new Error('User not found'));
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

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    logger.info(`User connected: ${socket.anonymousId} (${socket.userId})`);
    
    // Store connected user
    this.connectedUsers.set(socket.userId, {
      socketId: socket.id,
      anonymousId: socket.anonymousId,
      walletAddress: socket.walletAddress,
      connectedAt: new Date()
    });

    // Handle auction room joining
    socket.on('join_auction', (auctionId) => {
      this.handleJoinAuction(socket, auctionId);
    });

    // Handle auction room leaving
    socket.on('leave_auction', (auctionId) => {
      this.handleLeaveAuction(socket, auctionId);
    });

    // Handle bid placement
    socket.on('place_bid', (data) => {
      this.handlePlaceBid(socket, data);
    });

    // Handle auction watching
    socket.on('watch_auction', (auctionId) => {
      this.handleWatchAuction(socket, auctionId);
    });

    // Handle unwatch auction
    socket.on('unwatch_auction', (auctionId) => {
      this.handleUnwatchAuction(socket, auctionId);
    });

    // Handle typing indicators for chat
    socket.on('typing_start', (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on('typing_stop', (data) => {
      this.handleTypingStop(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to auction platform',
      anonymousId: socket.anonymousId,
      timestamp: new Date()
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

      // Notify others in the room
      socket.to(`auction_${auctionId}`).emit('user_joined_auction', {
        anonymousId: socket.anonymousId,
        timestamp: new Date()
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

      // Notify others in the room
      socket.to(`auction_${auctionId}`).emit('user_left_auction', {
        anonymousId: socket.anonymousId,
        timestamp: new Date()
      });

      logger.info(`User ${socket.anonymousId} left auction ${auctionId}`);
    } catch (error) {
      logger.error('Error leaving auction room:', error);
    }
  }

  handlePlaceBid(socket, data) {
    try {
      const { auctionId, amount } = data;
      
      // Emit bid placement to auction room
      this.io.to(`auction_${auctionId}`).emit('bid_placed', {
        auctionId,
        bidder: socket.anonymousId,
        amount,
        timestamp: new Date()
      });

      logger.info(`Bid placed by ${socket.anonymousId} on auction ${auctionId}: ${amount}`);
    } catch (error) {
      logger.error('Error handling bid placement:', error);
      socket.emit('error', { message: 'Failed to place bid' });
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

  handleTypingStart(socket, data) {
    const { auctionId } = data;
    socket.to(`auction_${auctionId}`).emit('user_typing', {
      anonymousId: socket.anonymousId,
      isTyping: true
    });
  }

  handleTypingStop(socket, data) {
    const { auctionId } = data;
    socket.to(`auction_${auctionId}`).emit('user_typing', {
      anonymousId: socket.anonymousId,
      isTyping: false
    });
  }

  handleDisconnection(socket) {
    logger.info(`User disconnected: ${socket.anonymousId} (${socket.userId})`);
    
    // Remove from connected users
    this.connectedUsers.delete(socket.userId);
    
    // Clean up auction rooms
    for (const [auctionId, participants] of this.auctionRooms.entries()) {
      if (participants.has(socket.userId)) {
        participants.delete(socket.userId);
        
        // Notify others in the room
        socket.to(`auction_${auctionId}`).emit('user_left_auction', {
          anonymousId: socket.anonymousId,
          timestamp: new Date()
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
    this.io.to(`auction_${auctionId}`).emit(event, data);
  }

  broadcastToWatchers(auctionId, event, data) {
    this.io.to(`watchers_${auctionId}`).emit(event, data);
  }

  sendToUser(userId, event, data) {
    const user = this.connectedUsers.get(userId);
    if (user) {
      this.io.to(user.socketId).emit(event, data);
    }
  }

  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Auction-specific broadcasts
  broadcastBidUpdate(auctionId, bidData) {
    this.broadcastToAuction(auctionId, 'bid_update', {
      ...bidData,
      timestamp: new Date()
    });
  }

  broadcastAuctionEnd(auctionId, endData) {
    this.broadcastToAuction(auctionId, 'auction_ended', {
      ...endData,
      timestamp: new Date()
    });
    
    this.broadcastToWatchers(auctionId, 'auction_ended', {
      ...endData,
      timestamp: new Date()
    });
  }

  broadcastAuctionExtension(auctionId, extensionData) {
    this.broadcastToAuction(auctionId, 'auction_extended', {
      ...extensionData,
      timestamp: new Date()
    });
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
    const room = this.io.sockets.adapter.rooms.get(`watchers_${auctionId}`);
    return room ? room.size : 0;
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  async sendAuctionData(socket, auctionId) {
    try {
      // This would typically fetch auction data from database
      // For now, sending a placeholder
      socket.emit('auction_data', {
        auctionId,
        participantCount: this.getAuctionParticipantCount(auctionId),
        watcherCount: this.getWatcherCount(auctionId),
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error sending auction data:', error);
    }
  }

  // Statistics and monitoring
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeAuctions: this.auctionRooms.size,
      totalRooms: this.io.sockets.adapter.rooms.size,
      timestamp: new Date()
    };
  }
}

const socketService = new SocketService();

module.exports = (io) => {
  socketService.initialize(io);
  return socketService;
};

module.exports.socketService = socketService;