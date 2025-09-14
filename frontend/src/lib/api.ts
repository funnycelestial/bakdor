import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

export interface User {
  id: string;
  anonymousId: string;
  walletAddress: string;
  email?: string;
  profile: {
    reputation: number;
    totalAuctions: number;
    wonAuctions: number;
    successRate: number;
    memberSince: string;
    isVerified: boolean;
    trustMeBros: number;
  };
  balance: {
    total: number;
    available: number;
    locked: number;
  };
  status: string;
  createdAt: string;
}

export interface Auction {
  id: string;
  auctionId: string;
  title: string;
  description: string;
  category: string;
  type: 'forward' | 'reverse';
  seller: {
    userId: string;
    anonymousId: string;
    reputation: number;
  };
  pricing: {
    startingBid: number;
    currentBid: number;
    reservePrice: number;
    buyNowPrice: number;
    currency: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    duration: number;
  };
  status: string;
  bidding: {
    totalBids: number;
    uniqueBidders: number;
    highestBidder?: {
      anonymousId: string;
    };
  };
  analytics?: {
    views: number;
    watchersCount: number;
  };
  isWatching?: boolean;
  createdAt: string;
}

export interface Bid {
  bidId: string;
  auction: {
    title: string;
    status: string;
    endTime: string;
    auctionRef: string;
  };
  amount: number;
  status: string;
  timing: {
    placedAt: string;
  };
}

export interface EscrowTransaction {
  id: string;
  escrowId: string;
  auctionItem: string;
  buyer: string;
  seller: string;
  amount: string;
  status: string;
  deliveryDeadline: string;
}

export interface Dispute {
  disputeId: string;
  escrowId: string;
  auctionItem: string;
  initiator: string;
  respondent: string;
  reason: string;
  status: string;
  amount: string;
}

export interface Notification {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  data?: any;
  channels: {
    inApp: {
      read: boolean;
      readAt?: string;
    };
  };
  createdAt: string;
}

class ApiService {
  private authToken: string | null = null;
  private socket: Socket | null = null;

  constructor() {
    this.authToken = localStorage.getItem('auth_token');
  }

  setAuthToken(token: string) {
    this.authToken = token;
    localStorage.setItem('auth_token', token);
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  clearAuthToken() {
    this.authToken = null;
    localStorage.removeItem('auth_token');
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return data;
  }

  // Authentication - matches backend endpoints exactly
  async login(walletAddress: string, signature?: string) {
    const body: any = { walletAddress };
    if (signature) {
      body.signature = signature;
    }
    
    return this.request('/users/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getProfile() {
    return this.request('/users/me');
  }

  async updateProfile(profileData: any) {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  async refreshBalance() {
    return this.request('/users/balance/refresh', {
      method: 'PUT',
    });
  }

  async getUserDashboard() {
    return this.request('/users/dashboard');
  }

  async getUserWatchlist() {
    return this.request('/users/watchlist');
  }

  async getUserActivity() {
    return this.request('/users/activities');
  }

  // Auctions - matches backend routes exactly
  async getAuctions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/auctions${queryString ? `?${queryString}` : ''}`);
  }

  async getAuction(id: string) {
    return this.request(`/auctions/${id}`);
  }

  async createAuction(auctionData: any) {
    return this.request('/auctions/create', {
      method: 'POST',
      body: JSON.stringify(auctionData),
    });
  }

  async updateAuction(id: string, auctionData: any) {
    return this.request(`/auctions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(auctionData),
    });
  }

  async deleteAuction(id: string) {
    return this.request(`/auctions/${id}`, {
      method: 'DELETE',
    });
  }

  async getMyAuctions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/auctions/my${queryString ? `?${queryString}` : ''}`);
  }

  async getSellerAuctions(sellerId: string) {
    return this.request(`/auctions/seller/${sellerId}`);
  }

  async getWonAuctions() {
    return this.request('/auctions/won');
  }

  async watchAuction(auctionId: string) {
    return this.request(`/auctions/${auctionId}/watch`, {
      method: 'POST',
    });
  }

  async unwatchAuction(auctionId: string) {
    return this.request(`/auctions/${auctionId}/watch`, {
      method: 'DELETE',
    });
  }

  async closeAuction(auctionId: string, forceClose: boolean = false) {
    return this.request(`/auctions/${auctionId}/close`, {
      method: 'POST',
      body: JSON.stringify({ forceClose }),
    });
  }

  async confirmReceipt(auctionId: string) {
    return this.request(`/auctions/${auctionId}/receipt`, {
      method: 'POST',
    });
  }

  async updateDeliveryInfo(auctionId: string, deliveryData: any) {
    return this.request(`/auctions/${auctionId}/delivery`, {
      method: 'PUT',
      body: JSON.stringify(deliveryData),
    });
  }

  // Bidding - matches backend routes exactly
  async placeBid(auctionId: string, amount: number, isAutoBid: boolean = false) {
    return this.request(`/bids/auction/${auctionId}`, {
      method: 'POST',
      body: JSON.stringify({ amount, isAutoBid }),
    });
  }

  async getAuctionBids(auctionId: string, limit: number = 20) {
    return this.request(`/bids/auction/${auctionId}?limit=${limit}`);
  }

  async getMyBids(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/bids/user/my-bids${queryString ? `?${queryString}` : ''}`);
  }

  async getHighestBid(auctionId: string) {
    return this.request(`/bids/auction/${auctionId}/highest`);
  }

  async getBidCount(auctionId: string) {
    return this.request(`/bids/auction/${auctionId}/count`);
  }

  async retractBid(bidId: string) {
    return this.request(`/bids/${bidId}/retract`, {
      method: 'POST',
    });
  }

  async getBidStatus(bidId: string) {
    return this.request(`/bids/${bidId}/status`);
  }

  // Market data - matches backend routes
  async getMarketOverview() {
    return this.request('/overview');
  }

  async getLiveAuctions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/market/live${queryString ? `?${queryString}` : ''}`);
  }

  async getTrendingAuctions(limit: number = 20) {
    return this.request(`/market/trending?limit=${limit}`);
  }

  async getEndingSoonAuctions(hours: number = 1, limit: number = 20) {
    return this.request(`/market/ending-soon?hours=${hours}&limit=${limit}`);
  }

  async getFeaturedAuctions(limit: number = 10) {
    return this.request(`/market/featured?limit=${limit}`);
  }

  async getReverseAuctions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/market/reverse${queryString ? `?${queryString}` : ''}`);
  }

  async searchAuctions(query: string, filters: any = {}) {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/market/search?${queryString}`);
  }

  async getAuctionCategories() {
    return this.request('/market/categories');
  }

  // Wallet & Tokens - matches backend routes
  async getWalletBalance() {
    return this.request('/wallet/balance');
  }

  async getTransactionHistory(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/wallet/transactions${queryString ? `?${queryString}` : ''}`);
  }

  async depositTokens(amount: number, transactionHash: string) {
    return this.request('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, transactionHash }),
    });
  }

  async withdrawTokens(amount: number, recipientAddress: string) {
    return this.request('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, recipientAddress }),
    });
  }

  async transferTokens(recipientAddress: string, amount: number, note?: string) {
    return this.request('/wallet/transfer', {
      method: 'POST',
      body: JSON.stringify({ recipientAddress, amount, note }),
    });
  }

  async getTokenInfo() {
    return this.request('/tokens/info');
  }

  async getBurnStats(period: string = '30d') {
    return this.request(`/tokens/burn-stats?period=${period}`);
  }

  async getPaymentMethods() {
    return this.request('/wallet/payment-methods');
  }

  // Escrow - matches backend routes
  async getEscrowTransactions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/escrow/transactions${queryString ? `?${queryString}` : ''}`);
  }

  async getEscrowDetails(escrowId: string) {
    return this.request(`/escrow/${escrowId}`);
  }

  async confirmDelivery(escrowId: string, rating?: number, feedback?: string) {
    return this.request(`/escrow/${escrowId}/confirm-delivery`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  }

  async markAsDelivered(escrowId: string, trackingNumber?: string, carrier?: string) {
    return this.request(`/escrow/${escrowId}/mark-delivered`, {
      method: 'POST',
      body: JSON.stringify({ trackingNumber, carrier }),
    });
  }

  async initiateDispute(escrowId: string, reason: string, evidence?: any[]) {
    return this.request(`/escrow/${escrowId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason, evidence }),
    });
  }

  // Disputes - matches backend routes
  async getDisputes(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/disputes${queryString ? `?${queryString}` : ''}`);
  }

  async getDisputeDetails(disputeId: string) {
    return this.request(`/disputes/${disputeId}`);
  }

  async respondToDispute(disputeId: string, message: string, evidence?: any[]) {
    return this.request(`/disputes/${disputeId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ message, evidence }),
    });
  }

  // Notifications - matches backend routes
  async getNotifications(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/notifications${queryString ? `?${queryString}` : ''}`);
  }

  async markNotificationRead(notificationId: string) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', {
      method: 'PUT',
    });
  }

  // Security - matches backend routes
  async getSecurityStatus() {
    return this.request('/security/status');
  }

  async reportSecurityIssue(type: string, description: string, severity: string = 'medium') {
    return this.request('/security/report-issue', {
      method: 'POST',
      body: JSON.stringify({ type, description, severity }),
    });
  }

  async getSecurityEvents(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/security/events${queryString ? `?${queryString}` : ''}`);
  }

  // Two-Factor Authentication
  async setup2FA() {
    return this.request('/auth/2fa/setup', {
      method: 'POST',
    });
  }

  async verify2FA(token: string) {
    return this.request('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async disable2FA(token: string) {
    return this.request('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // WebSocket Management
  connectSocket(token: string): Socket {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket server:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    return this.socket;
  }

  disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Socket room management
  joinAuctionRoom(auctionId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join_auction', auctionId);
    }
  }

  leaveAuctionRoom(auctionId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave_auction', auctionId);
    }
  }

  // Real-time auction actions
  placeBidRealTime(auctionId: string, amount: number) {
    if (this.socket?.connected) {
      this.socket.emit('place_bid', { auctionId, amount });
    }
  }

  watchAuctionRealTime(auctionId: string) {
    if (this.socket?.connected) {
      this.socket.emit('watch_auction', auctionId);
    }
  }

  unwatchAuctionRealTime(auctionId: string) {
    if (this.socket?.connected) {
      this.socket.emit('unwatch_auction', auctionId);
    }
  }
}

export const apiService = new ApiService();