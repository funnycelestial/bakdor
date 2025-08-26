// controllers/mobileMoneyController.js
const axios = require('axios');
const crypto = require('crypto');
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');
const logger = require('../utils/logger');

class MobileMoneyController {
  constructor() {
    this.providers = {
      mtn_momo: {
        name: 'MTN Mobile Money',
        apiUrl: process.env.MTN_MOMO_API_URL || 'https://sandbox.momodeveloper.mtn.com',
        apiKey: process.env.MTN_MOMO_API_KEY,
        fees: 1.5,
        limits: { min: 10, max: 10000, daily: 50000 }
      },
      vodafone_cash: {
        name: 'Vodafone Cash',
        apiUrl: process.env.VODAFONE_CASH_API_URL || 'https://api.vodafone.com.gh',
        apiKey: process.env.VODAFONE_CASH_API_KEY,
        fees: 1.8,
        limits: { min: 10, max: 10000, daily: 50000 }
      },
      airteltigo: {
        name: 'AirtelTigo Money',
        apiUrl: process.env.AIRTELTIGO_API_URL || 'https://api.airteltigo.com.gh',
        apiKey: process.env.AIRTELTIGO_API_KEY,
        fees: 2.0,
        limits: { min: 10, max: 5000, daily: 25000 }
      },
      telecel_cash: {
        name: 'Telecel Cash',
        apiUrl: process.env.TELECEL_API_URL || 'https://api.telecel.com.gh',
        apiKey: process.env.TELECEL_API_KEY,
        fees: 1.7,
        limits: { min: 10, max: 8000, daily: 40000 }
      }
    };
  }

  // Initiate payment collection
  async initiatePayment(provider, phoneNumber, amount, reference, userId) {
    try {
      const providerConfig = this.providers[provider];
      if (!providerConfig) {
        throw new Error('Unsupported payment provider');
      }

      // Validate amount against limits
      if (amount < providerConfig.limits.min || amount > providerConfig.limits.max) {
        throw new Error(`Amount must be between ${providerConfig.limits.min} and ${providerConfig.limits.max} GHS`);
      }

      // Calculate fees
      const fee = Math.max(0.5, amount * (providerConfig.fees / 100));
      const totalAmount = amount + fee;

      let paymentResult;

      switch (provider) {
        case 'mtn_momo':
          paymentResult = await this.initiateMTNMoMo(phoneNumber, totalAmount, reference);
          break;
        case 'vodafone_cash':
          paymentResult = await this.initiateVodafoneCash(phoneNumber, totalAmount, reference);
          break;
        case 'airteltigo':
          paymentResult = await this.initiateAirtelTigo(phoneNumber, totalAmount, reference);
          break;
        case 'telecel_cash':
          paymentResult = await this.initiateTelecelCash(phoneNumber, totalAmount, reference);
          break;
        default:
          throw new Error('Provider not implemented');
      }

      // Create transaction record
      const transaction = new TokenTransaction({
        type: 'deposit',
        user: {
          userId,
          walletAddress: '', // Will be filled from user data
          anonymousId: '' // Will be filled from user data
        },
        amount,
        status: 'pending',
        mobileMoneyIntegration: {
          provider,
          phoneNumber,
          externalTransactionId: paymentResult.transactionId,
          exchangeRate: 1.0, // 1 GHS = 1 WKC
          localAmount: totalAmount,
          localCurrency: 'GHS',
          providerResponse: paymentResult
        },
        metadata: {
          description: `Token purchase via ${providerConfig.name}`,
          source: 'mobile_money',
          initiatedBy: 'user'
        }
      });

      await transaction.save();

      logger.payment('mobile_money_initiated', amount, 'GHS', {
        provider,
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        transactionId: paymentResult.transactionId,
        userId
      });

      return {
        success: true,
        transactionId: paymentResult.transactionId,
        amount: totalAmount,
        fee,
        status: paymentResult.status,
        nextStep: paymentResult.nextStep
      };

    } catch (error) {
      logger.error('Mobile money payment initiation failed:', error);
      throw error;
    }
  }

  // MTN Mobile Money integration
  async initiateMTNMoMo(phoneNumber, amount, reference) {
    try {
      // For demo purposes, simulate API call
      // In production, integrate with actual MTN MoMo API
      
      const transactionId = `MTN_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      
      // Simulate API response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        transactionId,
        status: 'pending',
        nextStep: 'USSD_PROMPT',
        message: `Dial *170# and follow prompts to complete payment of GHS ${amount}`
      };
    } catch (error) {
      logger.error('MTN MoMo API error:', error);
      throw new Error('MTN Mobile Money service temporarily unavailable');
    }
  }

  // Vodafone Cash integration
  async initiateVodafoneCash(phoneNumber, amount, reference) {
    try {
      const transactionId = `VOD_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      
      // Simulate API response
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      return {
        success: true,
        transactionId,
        status: 'pending',
        nextStep: 'SMS_CONFIRMATION',
        message: `SMS sent to ${phoneNumber}. Reply with PIN to complete payment of GHS ${amount}`
      };
    } catch (error) {
      logger.error('Vodafone Cash API error:', error);
      throw new Error('Vodafone Cash service temporarily unavailable');
    }
  }

  // AirtelTigo Money integration
  async initiateAirtelTigo(phoneNumber, amount, reference) {
    try {
      const transactionId = `ATG_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      
      // Simulate API response
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        success: true,
        transactionId,
        status: 'pending',
        nextStep: 'APP_NOTIFICATION',
        message: `Check your AirtelTigo Money app to approve payment of GHS ${amount}`
      };
    } catch (error) {
      logger.error('AirtelTigo API error:', error);
      throw new Error('AirtelTigo Money service temporarily unavailable');
    }
  }

  // Telecel Cash integration
  async initiateTelecelCash(phoneNumber, amount, reference) {
    try {
      const transactionId = `TEL_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      
      // Simulate API response
      await new Promise(resolve => setTimeout(resolve, 800));
      
      return {
        success: true,
        transactionId,
        status: 'pending',
        nextStep: 'USSD_PROMPT',
        message: `Dial *110# and follow prompts to complete payment of GHS ${amount}`
      };
    } catch (error) {
      logger.error('Telecel Cash API error:', error);
      throw new Error('Telecel Cash service temporarily unavailable');
    }
  }

  // Process payout
  async initiatePayout(provider, phoneNumber, amount, reference, userId) {
    try {
      const providerConfig = this.providers[provider];
      if (!providerConfig) {
        throw new Error('Unsupported payment provider');
      }

      // Calculate fees for payout
      const fee = Math.max(0.5, amount * (providerConfig.fees / 100));
      const netAmount = amount - fee;

      let payoutResult;

      switch (provider) {
        case 'mtn_momo':
          payoutResult = await this.payoutMTNMoMo(phoneNumber, netAmount, reference);
          break;
        case 'vodafone_cash':
          payoutResult = await this.payoutVodafoneCash(phoneNumber, netAmount, reference);
          break;
        case 'airteltigo':
          payoutResult = await this.payoutAirtelTigo(phoneNumber, netAmount, reference);
          break;
        case 'telecel_cash':
          payoutResult = await this.payoutTelecelCash(phoneNumber, netAmount, reference);
          break;
        default:
          throw new Error('Provider not implemented');
      }

      logger.payment('mobile_money_payout_initiated', netAmount, 'GHS', {
        provider,
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        transactionId: payoutResult.transactionId,
        userId
      });

      return {
        success: true,
        transactionId: payoutResult.transactionId,
        amount: netAmount,
        fee,
        status: payoutResult.status,
        estimatedCompletion: payoutResult.eta
      };

    } catch (error) {
      logger.error('Mobile money payout initiation failed:', error);
      throw error;
    }
  }

  // Payout implementations (simplified for demo)
  async payoutMTNMoMo(phoneNumber, amount, reference) {
    const transactionId = `MTN_OUT_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      transactionId,
      status: 'processing',
      eta: '2-5 minutes'
    };
  }

  async payoutVodafoneCash(phoneNumber, amount, reference) {
    const transactionId = `VOD_OUT_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    return {
      success: true,
      transactionId,
      status: 'processing',
      eta: '1-3 minutes'
    };
  }

  async payoutAirtelTigo(phoneNumber, amount, reference) {
    const transactionId = `ATG_OUT_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      success: true,
      transactionId,
      status: 'processing',
      eta: '3-10 minutes'
    };
  }

  async payoutTelecelCash(phoneNumber, amount, reference) {
    const transactionId = `TEL_OUT_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      success: true,
      transactionId,
      status: 'processing',
      eta: '1-5 minutes'
    };
  }

  // Webhook handlers for payment confirmations
  async handleWebhook(provider, payload, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(provider, payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { transactionId, status, amount } = this.parseWebhookPayload(provider, payload);
      
      // Find transaction
      const transaction = await TokenTransaction.findOne({
        'mobileMoneyIntegration.externalTransactionId': transactionId
      });

      if (!transaction) {
        logger.error('Transaction not found for webhook:', { provider, transactionId });
        return { success: false, error: 'Transaction not found' };
      }

      // Update transaction status
      if (status === 'completed' || status === 'successful') {
        transaction.status = 'confirmed';
        transaction.blockchain.isConfirmed = true;
        
        // Credit user balance for deposits
        if (transaction.type === 'deposit') {
          await User.findByIdAndUpdate(
            transaction.user.userId,
            { $inc: { balance: transaction.amount } }
          );
        }
        
        await transaction.save();

        logger.payment('mobile_money_confirmed', transaction.amount, 'GHS', {
          provider,
          transactionId,
          userId: transaction.user.userId
        });

        return { success: true };
      } else if (status === 'failed' || status === 'cancelled') {
        transaction.status = 'failed';
        await transaction.save();

        logger.payment('mobile_money_failed', transaction.amount, 'GHS', {
          provider,
          transactionId,
          userId: transaction.user.userId,
          reason: payload.reason || 'Unknown'
        });

        return { success: true };
      }

      return { success: true };
    } catch (error) {
      logger.error('Webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }

  verifyWebhookSignature(provider, payload, signature) {
    // Implement signature verification for each provider
    // This is a simplified version - in production, use proper HMAC verification
    try {
      const providerConfig = this.providers[provider];
      if (!providerConfig || !providerConfig.apiKey) {
        return false;
      }

      // For demo purposes, always return true
      // In production, implement proper signature verification
      return true;
    } catch (error) {
      logger.error('Signature verification error:', error);
      return false;
    }
  }

  parseWebhookPayload(provider, payload) {
    // Parse webhook payload based on provider format
    // This is simplified - each provider has different payload structures
    
    switch (provider) {
      case 'mtn_momo':
        return {
          transactionId: payload.financialTransactionId || payload.externalId,
          status: payload.status?.toLowerCase(),
          amount: parseFloat(payload.amount),
          reason: payload.reason
        };
      
      case 'vodafone_cash':
        return {
          transactionId: payload.transaction_id || payload.reference,
          status: payload.transaction_status?.toLowerCase(),
          amount: parseFloat(payload.amount),
          reason: payload.description
        };
      
      case 'airteltigo':
        return {
          transactionId: payload.txnid || payload.reference,
          status: payload.status?.toLowerCase(),
          amount: parseFloat(payload.amount),
          reason: payload.message
        };
      
      case 'telecel_cash':
        return {
          transactionId: payload.transactionId || payload.ref,
          status: payload.status?.toLowerCase(),
          amount: parseFloat(payload.amount),
          reason: payload.statusMessage
        };
      
      default:
        throw new Error('Unknown provider payload format');
    }
  }

  // Get provider status
  async getProviderStatus(provider) {
    try {
      const providerConfig = this.providers[provider];
      if (!providerConfig) {
        return { status: 'unavailable', message: 'Provider not configured' };
      }

      // Simulate health check
      // In production, make actual API calls to check provider status
      const isHealthy = Math.random() > 0.1; // 90% uptime simulation
      
      return {
        status: isHealthy ? 'active' : 'maintenance',
        message: isHealthy ? 'Service operational' : 'Temporary maintenance',
        fees: providerConfig.fees,
        limits: providerConfig.limits
      };
    } catch (error) {
      logger.error(`Error checking ${provider} status:`, error);
      return { status: 'error', message: 'Status check failed' };
    }
  }

  // Get all provider statuses
  async getAllProviderStatuses() {
    const statuses = {};
    
    for (const [providerId, config] of Object.entries(this.providers)) {
      statuses[providerId] = await this.getProviderStatus(providerId);
    }
    
    return statuses;
  }

  // Validate phone number for provider
  validatePhoneNumber(provider, phoneNumber) {
    // Ghana phone number validation
    const cleanNumber = phoneNumber.replace(/\s+/g, '');
    
    // Check if it's a valid Ghana number
    const ghanaRegex = /^(\+233|0)[2-9][0-9]{8}$/;
    
    if (!ghanaRegex.test(cleanNumber)) {
      return {
        isValid: false,
        error: 'Invalid Ghana phone number format'
      };
    }

    // Provider-specific validations
    const normalizedNumber = cleanNumber.startsWith('+233') 
      ? cleanNumber 
      : cleanNumber.replace(/^0/, '+233');

    switch (provider) {
      case 'mtn_momo':
        // MTN prefixes: 024, 025, 053, 054, 055, 059
        if (!/^\+233(24|25|53|54|55|59)/.test(normalizedNumber)) {
          return {
            isValid: false,
            error: 'Phone number is not an MTN number'
          };
        }
        break;
      
      case 'vodafone_cash':
        // Vodafone prefixes: 020, 050
        if (!/^\+233(20|50)/.test(normalizedNumber)) {
          return {
            isValid: false,
            error: 'Phone number is not a Vodafone number'
          };
        }
        break;
      
      case 'airteltigo':
        // AirtelTigo prefixes: 027, 026, 056, 057
        if (!/^\+233(27|26|56|57)/.test(normalizedNumber)) {
          return {
            isValid: false,
            error: 'Phone number is not an AirtelTigo number'
          };
        }
        break;
      
      case 'telecel_cash':
        // Telecel prefixes: 023, 028
        if (!/^\+233(23|28)/.test(normalizedNumber)) {
          return {
            isValid: false,
            error: 'Phone number is not a Telecel number'
          };
        }
        break;
    }

    return {
      isValid: true,
      normalizedNumber
    };
  }

  // Check daily limits
  async checkDailyLimit(userId, provider, amount) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyTotal = await TokenTransaction.aggregate([
      {
        $match: {
          'user.userId': userId,
          'mobileMoneyIntegration.provider': provider,
          createdAt: { $gte: today },
          status: { $in: ['confirmed', 'pending'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$mobileMoneyIntegration.localAmount' }
        }
      }
    ]);

    const currentTotal = dailyTotal[0]?.total || 0;
    const providerConfig = this.providers[provider];
    const dailyLimit = providerConfig?.limits.daily || 50000;

    if (currentTotal + amount > dailyLimit) {
      return {
        exceeded: true,
        currentTotal,
        dailyLimit,
        remaining: Math.max(0, dailyLimit - currentTotal)
      };
    }

    return {
      exceeded: false,
      currentTotal,
      dailyLimit,
      remaining: dailyLimit - currentTotal - amount
    };
  }
}

module.exports = new MobileMoneyController();