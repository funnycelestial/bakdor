const { WebSocketProvider } = require('ethers');
const logger = require('../utils/logger');

class WebSocketManager {
  constructor() {
    this.wsProvider = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
  }

  async connect() {
    try {
      const wsUrl = process.env.BLOCKCHAIN_WS_URL || 
                   process.env.BLOCKCHAIN_RPC_URL?.replace('https://', 'wss://').replace('/v3/', '/ws/v3/');
      
      if (!wsUrl) {
        throw new Error('WebSocket URL not configured');
      }

      this.wsProvider = new WebSocketProvider(wsUrl);
      
      // Setup connection event handlers
      this.wsProvider.on('connect', () => {
        logger.websocket('connected', { url: wsUrl });
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
      });

      this.wsProvider.on('disconnect', (error) => {
        logger.websocket('disconnected', { error: error?.message });
        this.isConnected = false;
        this.scheduleReconnection();
      });

      this.wsProvider.on('error', (error) => {
        logger.error('WebSocket provider error:', error);
        this.isConnected = false;
        this.scheduleReconnection();
      });

      // Test connection
      await this.wsProvider.getBlockNumber();
      logger.websocket('initialized', { provider: 'ready' });
      
      return this.wsProvider;
    } catch (error) {
      logger.error('Failed to connect WebSocket provider:', error);
      this.scheduleReconnection();
      throw error;
    }
  }

  scheduleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    logger.websocket('reconnection_scheduled', { 
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay 
    });

    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('WebSocket reconnection failed:', error);
      });
    }, delay);
  }

  async disconnect() {
    try {
      if (this.wsProvider) {
        await this.wsProvider.destroy();
        this.wsProvider = null;
      }
      this.isConnected = false;
      logger.websocket('disconnected', { reason: 'manual' });
    } catch (error) {
      logger.error('Error disconnecting WebSocket:', error);
    }
  }

  getProvider() {
    return this.wsProvider;
  }

  isReady() {
    return this.isConnected && this.wsProvider;
  }
}

module.exports = new WebSocketManager();