// Platform Configuration
export const PLATFORM_CONFIG = {
  name: 'The Backdoor',
  version: '1.0.0',
  tokenSymbol: 'WKC',
  tokenName: 'WikiCat Token',
  platformFee: 3, // 3%
  burnPercentage: 50, // 50% of fees burned
  minBidIncrement: 1,
  maxAuctionDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
  minAuctionDuration: 60 * 60 * 1000, // 1 hour
  auctionExtensionTime: 5 * 60 * 1000, // 5 minutes
} as const;

// Auction Categories
export const AUCTION_CATEGORIES = [
  'electronics',
  'fashion',
  'home-garden',
  'sports',
  'automotive',
  'books',
  'art',
  'collectibles',
  'services',
  'other'
] as const;

// Item Conditions
export const ITEM_CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like-new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' }
] as const;

// Shipping Methods
export const SHIPPING_METHODS = [
  { value: 'pickup', label: 'Local Pickup' },
  { value: 'standard', label: 'Standard Shipping' },
  { value: 'express', label: 'Express Shipping' },
  { value: 'digital', label: 'Digital Delivery' }
] as const;

// Payment Methods
export const PAYMENT_METHODS = [
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    type: 'mobile_money',
    countries: ['GH'],
    fees: 1.5,
    limits: { min: 10, max: 10000, daily: 50000 }
  },
  {
    id: 'vodafone_cash',
    name: 'Vodafone Cash',
    type: 'mobile_money',
    countries: ['GH'],
    fees: 1.8,
    limits: { min: 10, max: 10000, daily: 50000 }
  },
  {
    id: 'airteltigo',
    name: 'AirtelTigo Money',
    type: 'mobile_money',
    countries: ['GH'],
    fees: 2.0,
    limits: { min: 10, max: 5000, daily: 25000 }
  },
  {
    id: 'telecel_cash',
    name: 'Telecel Cash',
    type: 'mobile_money',
    countries: ['GH'],
    fees: 1.7,
    limits: { min: 10, max: 8000, daily: 40000 }
  },
  {
    id: 'visa_mastercard',
    name: 'Visa/Mastercard',
    type: 'bank_card',
    countries: ['GH', 'NG', 'KE', 'ZA'],
    fees: 2.9,
    limits: { min: 50, max: 50000, daily: 100000 }
  }
] as const;

// Notification Types
export const NOTIFICATION_TYPES = [
  'bid_placed',
  'bid_outbid',
  'auction_won',
  'auction_lost',
  'auction_ending',
  'auction_ended',
  'escrow_funded',
  'escrow_released',
  'delivery_confirmed',
  'dispute_filed',
  'dispute_resolved',
  'payment_received',
  'payment_failed',
  'security_alert',
  'system_maintenance',
  'account_verified',
  'welcome'
] as const;

// Security Event Types
export const SECURITY_EVENT_TYPES = [
  'login_attempt',
  'failed_login',
  'suspicious_activity',
  'rate_limit_exceeded',
  'identity_verification',
  'wallet_change',
  'large_transaction'
] as const;

// Dispute Types
export const DISPUTE_TYPES = [
  'item_not_received',
  'item_not_as_described',
  'payment_issue',
  'shipping_problem',
  'seller_unresponsive',
  'buyer_unresponsive',
  'other'
] as const;

// Status Colors
export const STATUS_COLORS = {
  active: 'bg-terminal-green/20 text-terminal-green',
  pending: 'bg-terminal-amber/20 text-terminal-amber',
  ended: 'bg-muted text-muted-foreground',
  cancelled: 'bg-terminal-red/20 text-terminal-red',
  suspended: 'bg-terminal-red/20 text-terminal-red',
  winning: 'bg-terminal-green/20 text-terminal-green',
  outbid: 'bg-terminal-red/20 text-terminal-red',
  won: 'bg-green-500/20 text-green-400',
  lost: 'bg-muted text-muted-foreground',
  confirmed: 'bg-terminal-green/20 text-terminal-green',
  failed: 'bg-terminal-red/20 text-terminal-red',
  disputed: 'bg-terminal-red/20 text-terminal-red',
  resolved: 'bg-terminal-green/20 text-terminal-green'
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    profile: '/auth/profile',
    refresh: '/auth/refresh'
  },
  auctions: {
    list: '/auctions',
    create: '/auctions',
    details: '/auctions/:id',
    search: '/auctions/search',
    categories: '/auctions/categories',
    featured: '/auctions/featured'
  },
  bids: {
    place: '/auctions/:id/bids',
    myBids: '/bids/my-bids',
    withdraw: '/bids/:id',
    status: '/bids/:id/status'
  },
  wallet: {
    balance: '/wallet/balance',
    transactions: '/wallet/transactions',
    deposit: '/wallet/deposit',
    withdraw: '/wallet/withdraw',
    transfer: '/wallet/transfer'
  },
  tokens: {
    info: '/tokens/info',
    burnStats: '/tokens/burn-stats',
    treasury: '/tokens/treasury'
  }
} as const;

// WebSocket Events
export const SOCKET_EVENTS = {
  // Connection
  connect: 'connect',
  disconnect: 'disconnect',
  error: 'error',
  
  // Auction Events
  joinAuction: 'join_auction',
  leaveAuction: 'leave_auction',
  bidUpdate: 'bid_update',
  auctionEnded: 'auction_ended',
  auctionExtended: 'auction_extended',
  
  // User Events
  userJoined: 'user_joined_auction',
  userLeft: 'user_left_auction',
  
  // Notifications
  newNotification: 'new_notification',
  notificationRead: 'notification_read',
  
  // System Events
  systemMaintenance: 'system_maintenance',
  tokensBurned: 'tokens_burned'
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  authToken: 'auth_token',
  refreshToken: 'refresh_token',
  walletAddress: 'wallet_address',
  userPreferences: 'user_preferences',
  watchlist: 'watchlist',
  recentSearches: 'recent_searches'
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  walletNotConnected: 'Please connect your wallet',
  insufficientBalance: 'Insufficient token balance',
  bidTooLow: 'Bid must be higher than current bid',
  auctionEnded: 'Auction has already ended',
  notAuctionOwner: 'You are not the owner of this auction',
  invalidBidAmount: 'Invalid bid amount',
  networkError: 'Network error, please try again',
  unknownError: 'An unknown error occurred'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  bidPlaced: 'Bid placed successfully',
  auctionCreated: 'Auction created successfully',
  walletConnected: 'Wallet connected successfully',
  paymentProcessed: 'Payment processed successfully',
  deliveryConfirmed: 'Delivery confirmed successfully',
  disputeFiled: 'Dispute filed successfully'
} as const;