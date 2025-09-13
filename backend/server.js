// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const logger = require('./utils/logger');
const redisClient = require('./config/redis');
const { errorHandler } = require('./middleware/errorHandler');
const connectDB = require('./config/db');

// Import routes with error handling
const routeFiles = [
  'authRoutes',
  'auctionRoutes',
  'userRoutes',
  'marketRoutes',
  'bidRoutes',
  'tokenRoutes',
  'walletRoutes',
  'escrowRoutes',
  'disputeRoutes',
  'notificationRoutes',
  'securityRoutes',
  'adminRoutes',
  'webhookRoutes',
  'twoFactorRoutes',
  'overviewRoutes'
];

const routes = {};

// Try to import each route file
routeFiles.forEach(routeFile => {
  try {
    routes[routeFile] = require(`./routes/${routeFile}`);
    logger.info(`✅ ${routeFile} loaded successfully`);
  } catch (error) {
    logger.error(`❌ Error loading ${routeFile}:`, error.message);
  }
});

// Import controllers with error handling
let webSocketController, blockchainEventController, realTimeController;

try {
  webSocketController = require('./controllers/webSocketController');
  logger.info('✅ webSocketController loaded successfully');
} catch (error) {
  logger.error('❌ Error loading webSocketController:', error.message);
}

try {
  blockchainEventController = require('./controllers/blockchainEventController');
  logger.info('✅ blockchainEventController loaded successfully');
} catch (error) {
  logger.error('❌ Error loading blockchainEventController:', error.message);
}

try {
  realTimeController = require('./controllers/realTimeController');
  logger.info('✅ realTimeController loaded successfully');
} catch (error) {
  logger.error('❌ Error loading realTimeController:', error.message);
}

const { apiLimiter } = require('./middleware/rateLimiter');
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('Created uploads directory');
}

// Security middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  })
);
app.use(compression());
app.use('/api/', apiLimiter);
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// Connect DB
connectDB();

// Redis connection
redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});
redisClient.on('error', (error) => {
  logger.error('Redis connection error (non-fatal):', error.message);
});

// Socket.IO setup
if (webSocketController) {
  webSocketController.initialize(io);
} else {
  logger.warn('Skipping WebSocket initialization due to controller error');
}

if (realTimeController) {
  realTimeController.initialize();
} else {
  logger.warn('Skipping real-time controller initialization due to controller error');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || 'v1',
    services: {
      database: 'connected',
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      websocket: 'active',
      blockchain: 'listening',
    },
  });
});

// API routes - only use routes that loaded successfully
const apiVersion = process.env.API_VERSION || 'v1';

if (routes.authRoutes) app.use(`/api/${apiVersion}/auth`, routes.authRoutes);
if (routes.twoFactorRoutes) app.use(`/api/${apiVersion}/auth/2fa`, routes.twoFactorRoutes);
if (routes.auctionRoutes) app.use(`/api/${apiVersion}/auctions`, routes.auctionRoutes);
if (routes.userRoutes) app.use(`/api/${apiVersion}/users`, routes.userRoutes);
if (routes.marketRoutes) app.use(`/api/${apiVersion}/market`, routes.marketRoutes);
if (routes.bidRoutes) app.use(`/api/${apiVersion}/bids`, routes.bidRoutes);
if (routes.tokenRoutes) app.use(`/api/${apiVersion}/tokens`, routes.tokenRoutes);
if (routes.walletRoutes) app.use(`/api/${apiVersion}/wallet`, routes.walletRoutes);
if (routes.escrowRoutes) app.use(`/api/${apiVersion}/escrow`, routes.escrowRoutes);
if (routes.disputeRoutes) app.use(`/api/${apiVersion}/disputes`, routes.disputeRoutes);
if (routes.notificationRoutes) app.use(`/api/${apiVersion}/notifications`, routes.notificationRoutes);
if (routes.securityRoutes) app.use(`/api/${apiVersion}/security`, routes.securityRoutes);
if (routes.adminRoutes) app.use(`/api/${apiVersion}/admin`, routes.adminRoutes);
if (routes.webhookRoutes) app.use(`/api/${apiVersion}/webhooks`, routes.webhookRoutes);
if (routes.overviewRoutes) app.use(`/api/${apiVersion}/overview`, routes.overviewRoutes);

// Static uploads
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(uploadsDir, req.path);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return next();
    res.sendFile(filePath);
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', data: null });
});

// Error handling middleware
app.use(errorHandler);

// Blockchain events
if (process.env.NODE_ENV !== 'test' && blockchainEventController) {
  blockchainEventController.initialize().catch((error) => {
    logger.error('Failed to initialize blockchain event controller:', error);
  });
}

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  if (blockchainEventController && blockchainEventController.stopEventListening) {
    blockchainEventController.stopEventListening();
  }
  if (require('./services/web3Service').cleanup) {
    require('./services/web3Service').cleanup();
  }
  if (realTimeController && realTimeController.stop) {
    realTimeController.stop();
  }
  server.close(() => {
    redisClient.quit();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

module.exports = { app, server, io };