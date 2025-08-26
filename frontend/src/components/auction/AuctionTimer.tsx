import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';

interface AuctionTimerProps {
  endTime: string;
  status: string;
  className?: string;
}

export const AuctionTimer = ({ endTime, status, className = "" }: AuctionTimerProps) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });

  useEffect(() => {
    if (status !== 'active') return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(endTime).getTime();
      const difference = end - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds, total: difference });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [endTime, status]);

  const formatTime = (time: number) => time.toString().padStart(2, '0');

  const getUrgencyLevel = () => {
    if (timeLeft.total <= 0) return 'ended';
    if (timeLeft.total <= 5 * 60 * 1000) return 'critical'; // 5 minutes
    if (timeLeft.total <= 60 * 60 * 1000) return 'urgent'; // 1 hour
    if (timeLeft.total <= 24 * 60 * 60 * 1000) return 'warning'; // 24 hours
    return 'normal';
  };

  const urgencyLevel = getUrgencyLevel();

  if (status !== 'active') {
    return (
      <Badge className="bg-muted text-muted-foreground">
        {status === 'ended' ? 'ENDED' : status.toUpperCase()}
      </Badge>
    );
  }

  if (timeLeft.total <= 0) {
    return (
      <Badge className="bg-terminal-red/20 text-terminal-red">
        ENDED
      </Badge>
    );
  }

  return (
    <div className={`${className} ${urgencyLevel === 'critical' ? 'animate-countdown-flash' : ''}`}>
      {timeLeft.days > 0 ? (
        <Badge className="bg-terminal-green/20 text-terminal-green">
          {timeLeft.days}d {formatTime(timeLeft.hours)}h {formatTime(timeLeft.minutes)}m
        </Badge>
      ) : timeLeft.hours > 0 ? (
        <Badge className={`${
          urgencyLevel === 'urgent' ? 'bg-terminal-amber/20 text-terminal-amber animate-pulse-slow' :
          'bg-terminal-green/20 text-terminal-green'
        }`}>
          {formatTime(timeLeft.hours)}h {formatTime(timeLeft.minutes)}m {formatTime(timeLeft.seconds)}s
        </Badge>
      ) : (
        <Badge className={`${
          urgencyLevel === 'critical' ? 'bg-terminal-red/20 text-terminal-red animate-pulse' :
          'bg-terminal-amber/20 text-terminal-amber animate-pulse-slow'
        }`}>
          {formatTime(timeLeft.minutes)}m {formatTime(timeLeft.seconds)}s
        </Badge>
      )}
    </div>
  );
};