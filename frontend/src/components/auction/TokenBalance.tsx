import { Progress } from "@/components/ui/progress";
import { formatTokenAmount } from '@/utils/formatters';

export const TokenBalance = () => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs">WKC BALANCE</span>
        <span className="text-xs text-terminal-green animate-pulse-slow">2,450</span>
      </div>
      <Progress value={70} className="h-1" />
      
      <div className="flex items-center justify-between">
        <span className="text-xs">PENDING BIDS</span>
        <span className="text-xs text-muted-foreground">680</span>
      </div>
      <Progress value={30} className="h-1" />
      
      <div className="flex items-center justify-between">
        <span className="text-xs">AVAILABLE</span>
        <span className="text-xs text-terminal-green">1,770</span>
      </div>
      <Progress value={80} className="h-1" />
    </div>
  );
};