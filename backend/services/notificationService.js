const nodemailer = require('nodemailer');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { socketService } = require('./socketService');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initializeEmailService();
  }

  async initializeEmailService() {
    try {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Verify connection
      await this.emailTransporter.verify();
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
    }
  }

  // Send notification through multiple channels
  async sendNotification(notificationData) {
    try {
      // Create notification record
      const notification = new Notification(notificationData);
      await notification.save();

      // Send through enabled channels
      const promises = [];

      if (notification.channels.inApp.enabled) {
        promises.push(this.sendInAppNotification(notification));
      }

      if (notification.channels.email.enabled) {
        promises.push(this.sendEmailNotification(notification));
      }

      if (notification.channels.push.enabled) {
        promises.push(this.sendPushNotification(notification));
      }

      if (notification.channels.sms.enabled) {
        promises.push(this.sendSMSNotification(notification));
      }

      await Promise.allSettled(promises);

      // Update notification status
      notification.status = 'sent';
      await notification.save();

      logger.notification('sent', notification.recipient.anonymousId, {
        notificationId: notification.notificationId,
        type: notification.type,
        channels: Object.keys(notification.channels).filter(
          (ch) => notification.channels[ch].enabled
        ),
      });

      return notification;
    } catch (error) {
      logger.error('Error sending notification:', error);
      throw error;
    }
  }

  // Send in-app notification via WebSocket
  async sendInAppNotification(notification) {
    try {
      if (socketService) {
        socketService.sendToUser(
          notification.recipient.userId,
          'new_notification',
          {
            notificationId: notification.notificationId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            priority: notification.priority,
            data: notification.data,
            timestamp: notification.createdAt,
          }
        );
      }

      notification.channels.inApp.sent = true;
      notification.channels.inApp.sentAt = new Date();
      await notification.save();

      return true;
    } catch (error) {
      logger.error('Error sending in-app notification:', error);
      return false;
    }
  }

  // Send email notification
  async sendEmailNotification(notification) {
    try {
      if (!this.emailTransporter) {
        throw new Error('Email service not initialized');
      }

      // Get user email
      const user = await User.findById(notification.recipient.userId);
      if (!user || !user.email) {
        return false;
      }

      const emailTemplate = this.getEmailTemplate(notification);

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: user.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text,
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      await notification.markEmailSent(result.messageId, 'delivered');

      return true;
    } catch (error) {
      logger.error('Error sending email notification:', error);
      await notification.markEmailSent(null, 'failed');
      return false;
    }
  }

  // Send push notification (placeholder)
  async sendPushNotification(notification) {
    try {
      // Implement push notification service (Firebase, OneSignal, etc.)
      // For now, just mark as sent
      await notification.markPushSent('push_placeholder', 'delivered');
      return true;
    } catch (error) {
      logger.error('Error sending push notification:', error);
      return false;
    }
  }

  // Send SMS notification (placeholder)
  async sendSMSNotification(notification) {
    try {
      // Implement SMS service integration
      // For now, just log
      logger.info('SMS notification would be sent:', {
        recipient: notification.recipient.anonymousId,
        message: notification.message,
      });
      return true;
    } catch (error) {
      logger.error('Error sending SMS notification:', error);
      return false;
    }
  }

  // Get email template based on notification type
  getEmailTemplate(notification) {
    const baseTemplate = {
      subject: notification.title,
      text: notification.message,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1a1a; color: #ffffff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; color: #00ff00;">Anonymous Auction Platform</h1>
          </div>
          <div style="padding: 20px; background: #f5f5f5;">
            <h2 style="color: #333;">${notification.title}</h2>
            <p style="color: #666; line-height: 1.6;">${
              notification.message
            }</p>
            ${
              notification.data
                ? this.formatNotificationData(notification.data)
                : ''
            }
          </div>
          <div style="background: #1a1a1a; color: #888; padding: 15px; text-align: center; font-size: 12px;">
            <p>This is an automated message from Anonymous Auction Platform</p>
            <p>Recipient ID: ${notification.recipient.anonymousId}</p>
          </div>
        </div>
      `,
    };

    return baseTemplate;
  }

  // Format notification data for email
  formatNotificationData(data) {
    if (!data) return '';

    let html =
      '<div style="margin-top: 15px; padding: 15px; background: #e9e9e9; border-radius: 5px;">';

    if (data.auctionId) {
      html += `<p><strong>Auction ID:</strong> ${data.auctionId}</p>`;
    }

    if (data.amount && data.currency) {
      html += `<p><strong>Amount:</strong> ${data.amount} ${data.currency}</p>`;
    }

    if (data.escrowId) {
      html += `<p><strong>Escrow ID:</strong> ${data.escrowId}</p>`;
    }

    html += '</div>';
    return html;
  }

  // Bulk notification methods
  async sendBulkNotification(userIds, notificationData) {
    const promises = userIds.map(async (userId) => {
      const user = await User.findById(userId);
      if (user) {
        return this.sendNotification({
          ...notificationData,
          recipient: {
            userId: user._id,
            anonymousId: user.anonymousId,
          },
        });
      }
    });

    const results = await Promise.allSettled(promises);
    const successful = results.filter((r) => r.status === 'fulfilled').length;

    logger.notification('bulk_sent', 'system', {
      totalRecipients: userIds.length,
      successful,
      failed: userIds.length - successful,
    });

    return { successful, failed: userIds.length - successful };
  }

  // System-wide announcements
  async sendSystemAnnouncement(title, message, priority = 'medium') {
    const activeUsers = await User.find({ status: 'active' }).select(
      '_id anonymousId'
    );

    const notificationData = {
      type: 'system_announcement',
      priority,
      title,
      message,
      channels: {
        inApp: { enabled: true },
        email: { enabled: true },
      },
    };

    return this.sendBulkNotification(
      activeUsers.map((u) => u._id),
      notificationData
    );
  }

  // Process pending notifications (for scheduled notifications)
  async processPendingNotifications() {
    try {
      const pendingNotifications = await Notification.findPending();

      for (const notification of pendingNotifications) {
        await this.sendNotification(notification);
      }

      logger.info(
        `Processed ${pendingNotifications.length} pending notifications`
      );
    } catch (error) {
      logger.error('Error processing pending notifications:', error);
    }
  }

  // Cleanup expired notifications
  async cleanupExpiredNotifications() {
    try {
      const result = await Notification.cleanupExpired();
      logger.info(`Cleaned up ${result.deletedCount} expired notifications`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Error cleaning up notifications:', error);
      return 0;
    }
  }
}

module.exports = new NotificationService();
