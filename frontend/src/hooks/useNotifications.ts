import { useState, useEffect, useCallback } from 'react';
import { apiService, Notification } from '@/lib/api';
import { useWebSocket } from './useWebSocket';
import { toast } from 'sonner';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isConnected, on, off } = useWebSocket();

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiService.getNotifications({ limit: 50 });
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!isConnected) return;

    const handleNewNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev.slice(0, 49)]);
      setUnreadCount(prev => prev + 1);
      
      // Show toast for important notifications
      if (notification.priority === 'high' || notification.priority === 'urgent') {
        toast.info(notification.title, {
          description: notification.message,
          duration: 5000
        });
      }
    };

    const handleNotificationRead = (data: { notificationId: string }) => {
      setNotifications(prev => prev.map(n => 
        n.notificationId === data.notificationId 
          ? { ...n, isRead: true }
          : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    on('new_notification', handleNewNotification);
    on('notification_read', handleNotificationRead);

    return () => {
      off('new_notification', handleNewNotification);
      off('notification_read', handleNotificationRead);
    };
  }, [isConnected, on, off]);

  const markAsRead = async (notificationId: string) => {
    try {
      await apiService.markNotificationRead(notificationId);
      setNotifications(prev => prev.map(n => 
        n.notificationId === notificationId 
          ? { ...n, isRead: true }
          : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      toast.error('Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      toast.error('Failed to mark all notifications as read');
    }
  };

  const getNotificationsByType = (type: string) => {
    return notifications.filter(n => n.type === type);
  };

  const getUnreadNotifications = () => {
    return notifications.filter(n => !n.isRead);
  };

  const getNotificationsByPriority = (priority: string) => {
    return notifications.filter(n => n.priority === priority);
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    getNotificationsByType,
    getUnreadNotifications,
    getNotificationsByPriority,
    refreshNotifications: loadNotifications
  };
}