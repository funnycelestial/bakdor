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
const connectDB = require('./config/db'); // <-- use db.js instead of duplicating

// Import routes
const authRoutes = require('./routes/authRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const userRoutes = require('./routes/userRoutes');
const marketRoutes = require('./routes/marketRoutes');
const bidRoutes = require('./routes/bidRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const walletRoutes = require('./routes/walletRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const escrowRoutes = require('./routes/escrowRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const securityRoutes = require('./routes/securityRoutes');
const adminRoutes = require('./routes/adminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const twoFactorRoutes = require('./routes/twoFactorRoutes');

// Import controllers
const webSocketController = require('./controllers/webSocketController');
const blockchainEventController = require('./controllers/blockchainEventController');
const realTimeController = require('./controllers/realTimeController');
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

// ✅ Connect DB (from db.js)
connectDB();

// Redis connection
redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});
redisClient.on('error', (error) => {
  logger.error('Redis connection error (non-fatal):', error.message);
});

// Socket.IO setup
webSocketController.initialize(io);
realTimeController.initialize();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || 'v1',
    services: {
      database: 'connected', // handled by db.js events
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      websocket: 'active',
      blockchain: 'listening',
    },
  });
});

// API routes
const apiVersion = process.env.API_VERSION || 'v1';
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/auth/2fa`, twoFactorRoutes);
app.use(`/api/${apiVersion}/auctions`, auctionRoutes);
app.use(`/api/${apiVersion}/users`, userRoutes);
app.use(`/api/${apiVersion}/market`, marketRoutes);
app.use(`/api/${apiVersion}/bids`, bidRoutes);
app.use(`/api/${apiVersion}/tokens`, tokenRoutes);
app.use(`/api/${apiVersion}/wallet`, walletRoutes);
app.use(`/api/${apiVersion}/payments`, paymentRoutes);
app.use(`/api/${apiVersion}/escrow`, escrowRoutes);
app.use(`/api/${apiVersion}/disputes`, disputeRoutes);
app.use(`/api/${apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${apiVersion}/security`, securityRoutes);
app.use(`/api/${apiVersion}/admin`, adminRoutes);
app.use(`/api/${apiVersion}/webhooks`, webhookRoutes);

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
if (process.env.NODE_ENV !== 'test') {
  blockchainEventController.initialize().catch((error) => {
    logger.error('Failed to initialize blockchain event controller:', error);
  });
}

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  if (blockchainEventController.stopEventListening) blockchainEventController.stopEventListening();
  if (require('./services/web3Service').cleanup) require('./services/web3Service').cleanup();
  if (realTimeController.stop) realTimeController.stop();

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
