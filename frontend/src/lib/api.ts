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
    verificationLevel: string;
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
  };
  amount: number;
  status: string;
  placedAt: string;
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
  adminAssigned?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  status: string;
  fees: string;
  processingTime: string;
}

export interface SecurityEvent {
  eventId: string;
  type: string;
  description: string;
  timestamp: string;
  severity: string;
  status: string;
}

export interface Notification {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  data?: any;
  isRead: boolean;
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
      throw new Error(data.message || 'Request failed');
    }

    return data;
  }

  // Authentication
  async register(walletAddress: string, signature: string, message: string, email?: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, signature, message, email }),
    });
  }

  async login(walletAddress: string, signature: string, message: string, twoFactorToken?: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, signature, message, twoFactorToken }),
    });
  }

  async getProfile() {
    return this.request('/auth/profile');
  }

  async updateProfile(profileData: any) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  // Auctions
  async getAuctions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/auctions?${queryString}`);
  }

  async getAuction(id: string) {
    return this.request(`/auctions/${id}`);
  }

  async createAuction(auctionData: any) {
    return this.request('/auctions', {
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

  async searchAuctions(query: string, filters: any = {}) {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/auctions/search?${queryString}`);
  }

  async getAuctionCategories() {
    return this.request('/auctions/categories');
  }

  async getFeaturedAuctions() {
    return this.request('/auctions/featured');
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

  // Bidding
  async placeBid(auctionId: string, amount: number) {
    return this.request(`/auctions/${auctionId}/bids`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  // Market data
  async getMarketOverview() {
    return this.request('/market/overview');
  }

  async getTrendingAuctions() {
    return this.request('/market/trending');
  }

  async getEndingSoonAuctions(hours: number = 1) {
    return this.request(`/market/ending-soon?hours=${hours}`);
  }

  // User dashboard
  async getUserDashboard() {
    return this.request('/users/dashboard');
  }

  async getUserWatchlist() {
    return this.request('/users/watchlist');
  }
  async getMyBids(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/bids/my-bids?${queryString}`);
  }

  async withdrawBid(bidId: string) {
    return this.request(`/bids/${bidId}`, {
      method: 'DELETE',
    });
  }

  async getBidStatus(bidId: string) {
    return this.request(`/bids/${bidId}/status`);
  }

  // Wallet & Tokens
  async getWalletBalance() {
    return this.request('/wallet/balance');
  }

  async getTransactionHistory(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/wallet/transactions?${queryString}`);
  }

  async depositTokens(amount: number, paymentMethod: string, phoneNumber?: string) {
    return this.request('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, paymentMethod, phoneNumber }),
    });
  }

  async withdrawTokens(amount: number, paymentMethod: string, phoneNumber?: string) {
    return this.request('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, paymentMethod, phoneNumber }),
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

  // Payments
  async getPaymentMethods() {
    return this.request('/payments/methods');
  }

  async processPayment(amount: number, paymentMethod: string, type: string, phoneNumber?: string) {
    return this.request('/payments/process', {
      method: 'POST',
      body: JSON.stringify({ amount, paymentMethod, type, phoneNumber }),
    });
  }

  async getPaymentStatus(transactionId: string) {
    return this.request(`/payments/${transactionId}/status`);
  }

  async getPaymentHistory(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/payments/history?${queryString}`);
  }

  // Escrow
  async getEscrowTransactions(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/escrow/transactions?${queryString}`);
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

  // Disputes
  async getDisputes(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/disputes?${queryString}`);
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

  // Notifications
  async getNotifications(params: any = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/notifications?${queryString}`);
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

  // Security
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
    return this.request(`/security/events?${queryString}`);
  }

  // Admin
  async getAdminDashboard() {
    return this.request('/admin/dashboard');
  }

  async getPlatformStatistics(period: string = '7d') {
    return this.request(`/admin/statistics?period=${period}`);
  }

  async approveAuction(auctionId: string, notes?: string) {
    return this.request(`/admin/auctions/${auctionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  async rejectAuction(auctionId: string, reason: string) {
    return this.request(`/admin/auctions/${auctionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // WebSocket Management
  connectSocket(token: string) {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
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
    if (this.socket) {
      this.socket.emit('join_auction', auctionId);
    }
  }

  leaveAuctionRoom(auctionId: string) {
    if (this.socket) {
      this.socket.emit('leave_auction', auctionId);
    }
  }

  // Real-time auction actions
  placeBidRealTime(auctionId: string, amount: number) {
    if (this.socket) {
      this.socket.emit('place_bid', { auctionId, amount });
    }
  }

  watchAuctionRealTime(auctionId: string) {
    if (this.socket) {
      this.socket.emit('watch_auction', auctionId);
    }
  }

  unwatchAuctionRealTime(auctionId: string) {
    if (this.socket) {
      this.socket.emit('unwatch_auction', auctionId);
    }
  }
}

export const apiService = new ApiService();