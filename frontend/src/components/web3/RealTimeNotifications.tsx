import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiService, Notification } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { toast } from 'sonner';

export const RealTimeNotifications = () => {
  const { isAuthenticated, user } = useWeb3();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      setupRealTimeNotifications();
    }
  }, [isAuthenticated]);

  const loadNotifications = async () => {
    try {
      const response = await apiService.getNotifications({ limit: 20 });
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealTimeNotifications = () => {
    const socket = apiService.getSocket();
    if (!socket) return;

    socket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev.slice(0, 19)]);
      setUnreadCount(prev => prev + 1);
      
      // Show toast for important notifications
      if (notification.priority === 'high' || notification.priority === 'urgent') {
        toast.info(notification.title, {
          description: notification.message
        });
      }
    });

    socket.on('notification_read', (data) => {
      setNotifications(prev => prev.map(n => 
        n.notificationId === data.notificationId 
          ? { ...n, isRead: true }
          : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    });
  };

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
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'bid_placed': return '💰';
      case 'bid_outbid': return '⚡';
      case 'auction_won': return '🏆';
      case 'auction_lost': return '😔';
      case 'auction_ending': return '⏰';
      case 'escrow_funded': return '🔒';
      case 'escrow_released': return '✅';
      case 'delivery_confirmed': return '📦';
      case 'dispute_filed': return '⚠️';
      case 'dispute_resolved': return '⚖️';
      case 'payment_received': return '💳';
      case 'security_alert': return '🔐';
      default: return '📢';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-terminal-red';
      case 'high': return 'text-terminal-amber';
      case 'medium': return 'text-terminal-green';
      case 'low': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-2">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div className="text-sm text-muted-foreground">
            Connect to The Backdoor for notifications
          </div>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary/20 rounded"></div>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-secondary/20 rounded"></div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">Live Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
              {unreadCount} New
            </Badge>
          )}
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notifications.map((notification) => (
            <div 
              key={notification.notificationId}
              className={`p-3 rounded border transition-all cursor-pointer ${
                notification.isRead 
                  ? 'border-panel-border/50 bg-secondary/10' 
                  : 'border-panel-border bg-secondary/20 hover:bg-secondary/30 animate-glow'
              }`}
              onClick={() => !notification.isRead && markAsRead(notification.notificationId)}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {notification.title}
                    </span>
                    <span className={`text-xs ${getPriorityColor(notification.priority)}`}>
                      {notification.priority === 'urgent' && '🔴'}
                      {notification.priority === 'high' && '🟡'}
                    </span>
                  </div>
                  <p className={`text-xs ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notification.message}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleTimeString()}
                    </span>
                    {notification.data?.amount && (
                      <span className="text-xs text-terminal-green">
                        {notification.data.amount} WKC
                      </span>
                    )}
                  </div>
                </div>
                {!notification.isRead && (
                  <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-slow"></div>
                )}
              </div>
            </div>
          ))}
        </div>

        {notifications.length === 0 && (
          <div className="text-center py-8">
            <div className="text-terminal-amber text-2xl mb-2">📭</div>
            <div className="text-sm text-muted-foreground">No notifications yet</div>
          </div>
        )}

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-xs border-panel-border hover:bg-accent"
          onClick={loadNotifications}
        >
          Refresh Notifications
        </Button>
      </div>
    </Card>
  );
};