import { useState, useEffect } from "react";

interface Activity {
  id: string;
  type: 'bid' | 'join' | 'watch';
  bidder: string;
  amount?: string;
  time: string;
}

export const LiveActivityFeed = () => {
  const [activities, setActivities] = useState<Activity[]>([
    { id: '1', type: 'bid', bidder: 'ANON_7X2', amount: '1,250', time: 'just now' },
    { id: '2', type: 'join', bidder: 'VOID_88', time: '5s ago' },
    { id: '3', type: 'bid', bidder: 'GHOST_99', amount: '1,200', time: '45s ago' },
  ]);

  // Simulate new activities
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance every 3 seconds
        const newActivity: Activity = {
          id: Date.now().toString(),
          type: Math.random() > 0.5 ? 'bid' : 'join',
          bidder: `USER_${Math.floor(Math.random() * 99)}`,
          amount: Math.random() > 0.5 ? `${1000 + Math.floor(Math.random() * 500)}` : undefined,
          time: 'just now'
        };

        setActivities(prev => [newActivity, ...prev.slice(0, 4)]);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'bid': return '💰';
      case 'join': return '🎯';
      case 'watch': return '👁️';
      default: return '•';
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'bid': return 'text-terminal-green';
      case 'join': return 'text-terminal-amber';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-live-pulse rounded-full animate-pulse-slow"></div>
        <span className="text-xs text-terminal-green">LIVE ACTIVITY</span>
      </div>
      
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {activities.map((activity, index) => (
          <div 
            key={activity.id} 
            className={`animate-slide-up text-xs flex items-center gap-2 p-2 rounded border border-panel-border/50 bg-secondary/20 ${index === 0 ? 'animate-glow' : ''}`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <span className="text-lg">{getActivityIcon(activity.type)}</span>
            <div className="flex-1">
              <span className={getActivityColor(activity.type)}>{activity.bidder}</span>
              {activity.amount && (
                <span className="text-terminal-green ml-2">{activity.amount} WKC</span>
              )}
            </div>
            <span className="text-muted-foreground">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};