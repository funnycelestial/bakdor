import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface LiveCountdownProps {
  targetTime: string;
  className?: string;
}

export const LiveCountdown = ({ targetTime, className = "" }: LiveCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState({ minutes: 4, seconds: 37 });
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        let newSeconds = prev.seconds - 1;
        let newMinutes = prev.minutes;

        if (newSeconds < 0) {
          newSeconds = 59;
          newMinutes = Math.max(0, newMinutes - 1);
        }

        const totalSeconds = newMinutes * 60 + newSeconds;
        setIsUrgent(totalSeconds < 60);

        return { minutes: newMinutes, seconds: newSeconds };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (time: number) => time.toString().padStart(2, '0');

  return (
    <div className={`${className} ${isUrgent ? 'animate-countdown-flash' : ''}`}>
      <Badge className={isUrgent ? 'bg-terminal-red/20 text-terminal-red' : 'bg-terminal-green/20 text-terminal-green'}>
        {formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
      </Badge>
    </div>
  );
};