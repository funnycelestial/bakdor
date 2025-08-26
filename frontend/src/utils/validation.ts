import { PLATFORM_CONFIG } from './constants';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateBidAmount = (
  bidAmount: string,
  currentBid: number,
  userBalance: string,
  minIncrement: number = PLATFORM_CONFIG.minBidIncrement
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!bidAmount || bidAmount.trim() === '') {
    return { isValid: false, errors: ['Bid amount is required'], warnings: [] };
  }

  const amount = parseFloat(bidAmount);
  const balance = parseFloat(userBalance);

  // Critical validations
  if (isNaN(amount) || amount <= 0) {
    errors.push('Bid amount must be a valid positive number');
  }

  if (amount <= currentBid) {
    errors.push(`Bid must be higher than current bid of ${currentBid} WKC`);
  }

  if (amount < currentBid + minIncrement) {
    errors.push(`Minimum bid is ${currentBid + minIncrement} WKC`);
  }

  if (amount > balance) {
    errors.push(`Insufficient balance. You have ${balance} WKC`);
  }

  // Warnings
  if (amount > balance * 0.8) {
    warnings.push('This bid uses more than 80% of your balance');
  }

  if (amount > currentBid * 2) {
    warnings.push('This bid is significantly higher than the current bid');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateAuctionData = (auctionData: any): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!auctionData.title || auctionData.title.trim().length < 5) {
    errors.push('Title must be at least 5 characters');
  }

  if (!auctionData.description || auctionData.description.trim().length < 20) {
    errors.push('Description must be at least 20 characters');
  }

  if (!auctionData.category) {
    errors.push('Category is required');
  }

  if (!auctionData.startingBid || parseFloat(auctionData.startingBid) <= 0) {
    errors.push('Starting bid must be greater than 0');
  }

  // Price validations
  const startingBid = parseFloat(auctionData.startingBid || '0');
  const reservePrice = parseFloat(auctionData.reservePrice || '0');
  const buyNowPrice = parseFloat(auctionData.buyNowPrice || '0');

  if (reservePrice > 0 && reservePrice < startingBid) {
    errors.push('Reserve price cannot be less than starting bid');
  }

  if (buyNowPrice > 0 && buyNowPrice <= Math.max(startingBid, reservePrice)) {
    errors.push('Buy now price must be greater than starting bid and reserve price');
  }

  // Duration validation
  const duration = parseInt(auctionData.duration || '0');
  if (duration < PLATFORM_CONFIG.minAuctionDuration) {
    errors.push('Auction duration must be at least 1 hour');
  }

  if (duration > PLATFORM_CONFIG.maxAuctionDuration) {
    errors.push('Auction duration cannot exceed 30 days');
  }

  // Warnings
  if (startingBid > 10000) {
    warnings.push('High starting bid may discourage bidders');
  }

  if (duration > 7 * 24 * 60 * 60 * 1000) {
    warnings.push('Long auction duration may reduce urgency');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateWalletAddress = (address: string): boolean => {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const validateEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhoneNumber = (phone: string, country: string = 'GH'): boolean => {
  if (!phone) return false;
  
  // Ghana phone number validation
  if (country === 'GH') {
    const ghanaRegex = /^(\+233|0)[2-9][0-9]{8}$/;
    return ghanaRegex.test(phone.replace(/\s/g, ''));
  }
  
  // Generic international format
  const internationalRegex = /^\+?[1-9]\d{1,14}$/;
  return internationalRegex.test(phone.replace(/\s/g, ''));
};

export const validateTransactionHash = (hash: string): boolean => {
  if (!hash) return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .slice(0, 1000); // Limit length
};

export const validateFileUpload = (file: File): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (file.size > maxSize) {
    errors.push('File size must be less than 5MB');
  }

  if (!allowedTypes.includes(file.type)) {
    errors.push('Only JPEG, PNG, WebP, and GIF files are allowed');
  }

  if (file.size > 2 * 1024 * 1024) {
    warnings.push('Large files may take longer to upload');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};