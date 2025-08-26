import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";

interface Notification {
  id: string;
  type: 'bid' | 'auction_end' | 'escrow' | 'dispute' | 'payment' | 'delivery';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
}

export const NotificationPanel = () => {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'bid',
      title: 'New Bid Received',
      message: 'ANON_7X2 placed a bid of 1,250 WKC on iPhone 15 Pro Max',
      timestamp: '2m ago',
      read: false,
      priority: 'medium'
    },
    {
      id: '2',
      type: 'escrow',
      title: 'Escrow Funded',
      message: 'Escrow ESC_001 has been funded. Awaiting delivery confirmation.',
      timestamp: '15m ago',
      read: false,
      priority: 'high'
    },
    {
      id: '3',
      type: 'auction_end',
      title: 'Auction Ending Soon',
      message: 'MacBook Pro M3 auction ends in 5 minutes',
      timestamp: '1h ago',
      read: true,
      priority: 'high'
    },
    {
      id: '4',
      type: 'dispute',
      title: 'Dispute Filed',
      message: 'A dispute has been filed for transaction ESC_001',
      timestamp: '2h ago',
      read: false,
      priority: 'high'
    }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'bid': return '💰';
      case 'auction_end': return '⏰';
      case 'escrow': return '🔒';
      case 'dispute': return '⚠️';
      case 'payment': return '💳';
      case 'delivery': return '📦';
      default: return '📢';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-terminal-red';
      case 'medium': return 'text-terminal-amber';
      case 'low': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  // Simulate new notifications
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.8) { // 20% chance every 5 seconds
        const newNotification: Notification = {
          id: Date.now().toString(),
          type: 'bid',
          title: 'New Activity',
          message: `USER_${Math.floor(Math.random() * 99)} placed a new bid`,
          timestamp: 'just now',
          read: false,
          priority: 'medium'
        };
        
        setNotifications(prev => [newNotification, ...prev.slice(0, 9)]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-terminal-green">Notifications</h4>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="bg-terminal-red/20 text-terminal-red">
            {unreadCount}
          </Badge>
        )}
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {notifications.slice(0, 8).map((notification) => (
          <div 
            key={notification.id}
            className={`p-2 rounded border transition-all cursor-pointer ${
              notification.read 
                ? 'border-panel-border/50 bg-secondary/10' 
                : 'border-panel-border bg-secondary/20 hover:bg-secondary/30'
            }`}
            onClick={() => markAsRead(notification.id)}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm">{getNotificationIcon(notification.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notification.title}
                  </span>
                  <span className={`text-xs ${getPriorityColor(notification.priority)}`}>
                    {notification.priority === 'high' && '🔴'}
                  </span>
                </div>
                <p className={`text-xs mt-1 ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {notification.message}
                </p>
                <span className="text-xs text-muted-foreground">{notification.timestamp}</span>
              </div>
              {!notification.read && (
                <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-slow"></div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="w-full bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
        View All Notifications
      </button>
    </div>
  );
};