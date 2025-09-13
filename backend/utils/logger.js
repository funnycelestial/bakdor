const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId,
      anonymousId: req.user?.anonymousId
    };
    
    if (res.statusCode >= 400) {
      logger.error('HTTP Request Error', logData);
    } else {
      logger.http('HTTP Request', logData);
    }
  });
  
  next();
};

// Add blockchain transaction logging
logger.blockchain = (action, data) => {
  logger.info(`Blockchain ${action}`, {
    action,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add WebSocket connection logging
logger.websocket = (action, data = {}) => {
  logger.info(`WebSocket ${action}`, {
    action,
    ...data,
    timestamp: new Date().toISOString()
  });
};
// Add auction activity logging
logger.auction = (action, auctionId, data = {}) => {
  logger.info(`Auction ${action}`, {
    action,
    auctionId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add user activity logging
logger.user = (action, userId, data = {}) => {
  logger.info(`User ${action}`, {
    action,
    userId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add security logging
logger.security = (event, data = {}) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add performance logging
logger.performance = (operation, duration, data = {}) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add database logging
logger.database = (operation, collection, data = {}) => {
  logger.debug(`Database ${operation}`, {
    operation,
    collection,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add API logging
logger.api = (endpoint, method, status, data = {}) => {
  const level = status >= 400 ? 'error' : 'info';
  logger[level](`API ${method} ${endpoint}`, {
    endpoint,
    method,
    status,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add notification logging
logger.notification = (type, recipient, data = {}) => {
  logger.info(`Notification ${type}`, {
    type,
    recipient,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add payment logging
logger.payment = (action, amount, currency, data = {}) => {
  logger.info(`Payment ${action}`, {
    action,
    amount,
    currency,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add escrow logging
logger.escrow = (action, escrowId, data = {}) => {
  logger.info(`Escrow ${action}`, {
    action,
    escrowId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Add dispute logging
logger.dispute = (action, disputeId, data = {}) => {
  logger.warn(`Dispute ${action}`, {
    action,
    disputeId,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Error handling for logger
logger.on('error', (error) => {
  console.error('Logger error:', error);
});

module.exports = logger;