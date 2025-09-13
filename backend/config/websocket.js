const { WebSocketProvider, JsonRpcProvider } = require('ethers');
const logger = require('../utils/logger');

class WebSocketManager {
  constructor() {
    this.wsProvider = null;
    this.rpcProvider = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5;
    this.reconnectDelay = parseInt(process.env.RECONNECT_DELAY) || 1000;
    this.maxReconnectDelay = parseInt(process.env.MAX_RECONNECT_DELAY) || 30000;
    this.connectionTimeout = parseInt(process.env.CONNECTION_TIMEOUT) || 30000; // Increased to 30 seconds
    this.currentUrl = null;
    this.currentRpcUrl = null;
    this.availableRpcUrls = [];
    this.availableWsUrls = [];
    this.urlIndex = 0;
    this.rpcUrlIndex = 0;
  }

  // URL validation utility
  validateUrl(url, type = 'any') {
    if (!url) throw new Error('URL is required');
    
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    
    if (type === 'ws' && !url.startsWith('wss://')) {
      throw new Error(`WebSocket URL must start with wss://: ${url}`);
    }
    
    if (type === 'http' && !url.startsWith('http')) {
      throw new Error(`HTTP URL must start with http:// or https://: ${url}`);
    }
    
    return true;
  }

  // Convert URL between protocols
  convertUrl(url, toProtocol) {
    if (!url) return null;
    
    // Handle specific provider conversions
    if (url.includes('bsc-dataseed.binance.org')) {
      return toProtocol === 'ws' 
        ? 'wss://bsc-ws-node1.binance.org:443/ws'
        : url;
    }
    
    if (url.includes('infura.io')) {
      return toProtocol === 'ws'
        ? url.replace('https://', 'wss://').replace('/v3/', '/ws/v3/')
        : url;
    }
    
    if (url.includes('alchemyapi.io')) {
      return toProtocol === 'ws'
        ? url.replace('https://', 'wss://').replace('/v2/', '/ws/v2/')
        : url;
    }
    
    // Generic conversion
    return toProtocol === 'ws'
      ? url.replace('https://', 'wss://').replace('http://', 'ws://')
      : url.replace('wss://', 'https://').replace('ws://', 'http://');
  }

  // Parse comma-separated URLs from environment variable
  parseUrlsFromEnv(envVar) {
    if (!envVar) return [];
    
    return envVar.split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0);
  }

  // Initialize available URLs
  initializeUrls() {
    // Clear existing URLs
    this.availableRpcUrls = [];
    this.availableWsUrls = [];
    
    // Primary URLs
    const primaryRpcUrl = process.env.BLOCKCHAIN_RPC_URL;
    const primaryWsUrl = process.env.BLOCKCHAIN_WS_URL;
    
    // Add primary URLs to available lists
    if (primaryRpcUrl) {
      try {
        this.validateUrl(primaryRpcUrl, 'http');
        this.availableRpcUrls.push(primaryRpcUrl);
        logger.info(`Primary RPC URL: ${primaryRpcUrl}`);
      } catch (error) {
        logger.warn(`Primary RPC URL invalid: ${primaryRpcUrl} - ${error.message}`);
      }
    }
    
    if (primaryWsUrl) {
      try {
        this.validateUrl(primaryWsUrl, 'ws');
        this.availableWsUrls.push(primaryWsUrl);
        logger.info(`Primary WebSocket URL: ${primaryWsUrl}`);
      } catch (error) {
        logger.warn(`Primary WebSocket URL invalid: ${primaryWsUrl} - ${error.message}`);
      }
    }
    
    // Add fallback URLs from environment variables
    const fallbackRpcUrls = this.parseUrlsFromEnv(process.env.FALLBACK_RPC_URLS);
    const fallbackWsUrls = this.parseUrlsFromEnv(process.env.FALLBACK_WS_URLS);
    
    fallbackRpcUrls.forEach(url => {
      try {
        this.validateUrl(url, 'http');
        if (!this.availableRpcUrls.includes(url)) {
          this.availableRpcUrls.push(url);
          logger.info(`Fallback RPC URL: ${url}`);
        }
      } catch (error) {
        logger.warn(`Fallback RPC URL invalid: ${url} - ${error.message}`);
      }
    });
    
    fallbackWsUrls.forEach(url => {
      try {
        this.validateUrl(url, 'ws');
        if (!this.availableWsUrls.includes(url)) {
          this.availableWsUrls.push(url);
          logger.info(`Fallback WebSocket URL: ${url}`);
        }
      } catch (error) {
        logger.warn(`Fallback WebSocket URL invalid: ${url} - ${error.message}`);
      }
    });
    
    // Add additional URLs from environment variables
    const additionalRpcUrls = this.parseUrlsFromEnv(process.env.ADDITIONAL_RPC_URLS);
    const additionalWsUrls = this.parseUrlsFromEnv(process.env.ADDITIONAL_WS_URLS);
    
    additionalRpcUrls.forEach(url => {
      try {
        this.validateUrl(url, 'http');
        if (!this.availableRpcUrls.includes(url)) {
          this.availableRpcUrls.push(url);
          logger.info(`Additional RPC URL: ${url}`);
        }
      } catch (error) {
        logger.warn(`Additional RPC URL invalid: ${url} - ${error.message}`);
      }
    });
    
    additionalWsUrls.forEach(url => {
      try {
        this.validateUrl(url, 'ws');
        if (!this.availableWsUrls.includes(url)) {
          this.availableWsUrls.push(url);
          logger.info(`Additional WebSocket URL: ${url}`);
        }
      } catch (error) {
        logger.warn(`Additional WebSocket URL invalid: ${url} - ${error.message}`);
      }
    });
    
    // Add common BSC endpoints as last resort
    const commonBscRpcUrls = [
      'https://bsc-dataseed1.defibit.io/',
      'https://bsc-dataseed1.ninicoin.io/',
      'https://bsc-dataseed2.defibit.io/',
      'https://bsc-dataseed3.defibit.io/',
      'https://bsc-mainnet.infura.io/v3/54dcc139aafa45f88f1ac37222fc6998'
    ];
    
    const commonBscWsUrls = [
      'wss://bsc-ws-node2.binance.org:443/ws',
      'wss://bsc-ws-node3.binance.org:443/ws',
      'wss://bsc-ws-node4.binance.org:443/ws',
      'wss://bsc-ws-node.nariox.org:443'
    ];
    
    commonBscRpcUrls.forEach(url => {
      if (!this.availableRpcUrls.includes(url)) {
        this.availableRpcUrls.push(url);
        logger.info(`Common BSC RPC URL: ${url}`);
      }
    });
    
    commonBscWsUrls.forEach(url => {
      if (!this.availableWsUrls.includes(url)) {
        this.availableWsUrls.push(url);
        logger.info(`Common BSC WebSocket URL: ${url}`);
      }
    });
    
    logger.info(`Initialized ${this.availableRpcUrls.length} RPC URLs and ${this.availableWsUrls.length} WebSocket URLs`);
  }

  // Test connection with timeout and proper error handling
  async testConnection(url, type = 'ws') {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout);
      });
      
      let connectionPromise;
      
      if (type === 'ws') {
        // Use a direct WebSocket test first to catch DNS errors
        await this.testWebSocketConnection(url);
        
        // If direct test passes, test with ethers provider
        const provider = new WebSocketProvider(url);
        
        connectionPromise = new Promise((resolve, reject) => {
          // Handle WebSocket errors
          provider.on('error', (error) => {
            reject(new Error(`WebSocket error: ${error.message}`));
          });
          
          // Test the connection
          provider.getBlockNumber()
            .then(blockNumber => {
              resolve(blockNumber);
            })
            .catch(reject);
        });
        
        // Clean up provider after test
        connectionPromise.finally(() => {
          try {
            provider.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      } else {
        const provider = new JsonRpcProvider(url);
        connectionPromise = provider.getBlockNumber();
        connectionPromise.finally(() => {
          try {
            provider.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      }
      
      await Promise.race([connectionPromise, timeoutPromise]);
      return { success: true, url };
    } catch (error) {
      return { success: false, url, error: error.message };
    }
  }

  // Improved WebSocket connection test with better timeout handling
  async testWebSocketConnection(url) {
    return new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(url);
      
      let timeoutTriggered = false;
      
      const timeout = setTimeout(() => {
        timeoutTriggered = true;
        try {
          ws.terminate();
        } catch (e) {
          // Ignore termination errors
        }
        reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
      }, this.connectionTimeout);
      
      ws.on('open', () => {
        if (timeoutTriggered) return;
        clearTimeout(timeout);
        ws.close();
        resolve();
      });
      
      ws.on('error', (error) => {
        if (timeoutTriggered) return;
        clearTimeout(timeout);
        try {
          ws.terminate();
        } catch (e) {
          // Ignore termination errors
        }
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });
      
      ws.on('close', () => {
        if (timeoutTriggered) return;
        clearTimeout(timeout);
      });
    });
  }

  // Find working URL by testing all available
  async findWorkingUrl(urls, type = 'ws') {
    const workingUrls = [];
    
    logger.info(`Testing ${urls.length} ${type.toUpperCase()} URLs...`);
    
    // Test all URLs to find working ones
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        logger.info(`Testing ${type.toUpperCase()} URL (${i + 1}/${urls.length}): ${url}`);
        const result = await this.testConnection(url, type);
        
        if (result.success) {
          workingUrls.push(url);
          logger.info(`✅ Working ${type.toUpperCase()} URL found: ${url}`);
          // Return the first working URL immediately
          return url;
        } else {
          logger.warn(`❌ ${type.toUpperCase()} URL failed: ${url} - ${result.error}`);
        }
      } catch (error) {
        logger.error(`Error testing ${type.toUpperCase()} URL ${url}:`, error.message);
      }
    }
    
    if (workingUrls.length === 0) {
      throw new Error(`No working ${type.toUpperCase()} URL found after testing ${urls.length} URLs`);
    }
    
    // This line should never be reached due to early return above
    return workingUrls[0];
  }

  // Setup provider event handlers
  setupProviderEventHandlers() {
    // Handle new blocks
    this.wsProvider.on('block', (blockNumber) => {
      if (!this.isConnected) {
        logger.websocket('connected', { 
          url: this.currentUrl, 
          blockNumber,
          provider: 'WebSocketProvider' 
        });
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      }
      logger.debug(`New block received: ${blockNumber}`);
    });
    
    // Handle connection errors
    this.wsProvider.on('error', (error) => {
      logger.websocket('disconnected', { 
        url: this.currentUrl, 
        error: error?.message 
      });
      this.isConnected = false;
      this.scheduleReconnection();
    });
  }

  // Test the provider connection
  async testProviderConnection() {
    try {
      const blockNumber = await this.wsProvider.getBlockNumber();
      logger.websocket('initialized', { 
        provider: 'WebSocketProvider', 
        blockNumber,
        url: this.currentUrl 
      });
    } catch (testError) {
      logger.error('WebSocket connection test failed:', testError);
      throw new Error(`WebSocket connection test failed: ${testError.message}`);
    }
  }

  // Connect to WebSocket with robust fallbacks and sequential testing
  async connect() {
    try {
      this.initializeUrls();
      
      if (this.availableWsUrls.length === 0) {
        throw new Error('No WebSocket URLs available');
      }
      
      let wsUrl;
      let connectionError;
      
      // Try WebSocket URLs first
      for (const url of this.availableWsUrls) {
        try {
          logger.info(`Attempting to connect to WebSocket: ${url}`);
          const result = await this.testConnection(url, 'ws');
          
          if (result.success) {
            wsUrl = url;
            logger.info(`✅ WebSocket connection successful: ${url}`);
            break;
          } else {
            logger.warn(`❌ WebSocket connection failed: ${url} - ${result.error}`);
            connectionError = result.error;
          }
        } catch (error) {
          logger.warn(`❌ WebSocket connection error: ${url} - ${error.message}`);
          connectionError = error.message;
        }
      }
      
      // If no WebSocket URL worked, try converting RPC URLs
      if (!wsUrl && this.availableRpcUrls.length > 0) {
        logger.info('No WebSocket URLs worked, trying RPC conversions');
        
        for (const rpcUrl of this.availableRpcUrls) {
          const convertedUrl = this.convertUrl(rpcUrl, 'ws');
          if (convertedUrl) {
            try {
              logger.info(`Testing converted WebSocket URL: ${convertedUrl}`);
              const result = await this.testConnection(convertedUrl, 'ws');
              
              if (result.success) {
                wsUrl = convertedUrl;
                logger.info(`✅ Converted WebSocket connection successful: ${convertedUrl}`);
                break;
              } else {
                logger.warn(`❌ Converted WebSocket connection failed: ${convertedUrl} - ${result.error}`);
              }
            } catch (error) {
              logger.warn(`❌ Converted WebSocket connection error: ${convertedUrl} - ${error.message}`);
            }
          }
        }
      }
      
      if (!wsUrl) {
        throw new Error(`No working WebSocket URL found after testing all options. Last error: ${connectionError || 'Unknown error'}`);
      }
      
      this.currentUrl = wsUrl;
      logger.info(`Connecting to WebSocket: ${wsUrl}`);
      
      // Create and configure provider
      this.wsProvider = new WebSocketProvider(wsUrl);
      
      // Set up event handlers
      this.setupProviderEventHandlers();
      
      // Test the connection
      await this.testProviderConnection();
      
      return this.wsProvider;
    } catch (error) {
      logger.error('WebSocket connection failed after all attempts:', error);
      this.scheduleReconnection();
      throw error;
    }
  }

  // Get RPC provider (for fallback)
  async getRpcProvider() {
    if (this.rpcProvider) {
      return this.rpcProvider;
    }
    
    if (this.availableRpcUrls.length === 0) {
      throw new Error('No RPC URLs available');
    }
    
    try {
      const rpcUrl = await this.findWorkingUrl(this.availableRpcUrls, 'http');
      this.currentRpcUrl = rpcUrl;
      this.rpcProvider = new JsonRpcProvider(rpcUrl);
      
      logger.info(`RPC provider initialized: ${rpcUrl}`);
      return this.rpcProvider;
    } catch (error) {
      logger.error('Failed to initialize RPC provider:', error);
      throw error;
    }
  }

  // Schedule reconnection
  scheduleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    logger.websocket('reconnection_scheduled', { 
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
      currentUrl: this.currentUrl
    });
    
    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('WebSocket reconnection failed:', error);
      });
    }, delay);
  }

  // Disconnect
  async disconnect() {
    try {
      if (this.wsProvider) {
        await this.wsProvider.destroy();
        this.wsProvider = null;
      }
      
      if (this.rpcProvider) {
        this.rpcProvider.destroy();
        this.rpcProvider = null;
      }
      
      this.isConnected = false;
      this.reconnectAttempts = 0;
      logger.websocket('disconnected', { reason: 'manual' });
    } catch (error) {
      logger.error('Error disconnecting WebSocket:', error);
    }
  }

  // Get provider
  getProvider() {
    return this.wsProvider;
  }

  // Get RPC provider
  getRpcProvider() {
    return this.rpcProvider;
  }

  // Check if ready
  isReady() {
    return this.isConnected && this.wsProvider;
  }

  // Get current URL
  getCurrentUrl() {
    return this.currentUrl;
  }

  // Get available URLs
  getAvailableUrls() {
    return {
      rpc: this.availableRpcUrls,
      ws: this.availableWsUrls
    };
  }

  // Reset URL index (for testing)
  resetUrlIndex() {
    this.urlIndex = 0;
    this.rpcUrlIndex = 0;
  }
}

module.exports = new WebSocketManager();