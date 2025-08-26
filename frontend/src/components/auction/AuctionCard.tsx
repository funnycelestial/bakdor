import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { toast } from 'sonner';
import { formatTokenAmount } from '@/utils/formatters';

interface AuctionCardProps {
  auctionId: string;
  item: string;
  currentBid: string;
  timeLeft: string;
  category: string;
  isHot?: boolean;
  auctionType?: 'forward' | 'reverse';
  watchers?: number;
  onBidClick: () => void;
}

export const AuctionCard = ({ auctionId, item, currentBid, timeLeft, category, isHot, auctionType = 'forward', watchers, onBidClick }: AuctionCardProps) => {
  const isUrgent = timeLeft.includes('m') && parseInt(timeLeft) < 10;
  const isReverse = auctionType === 'reverse';
  const { isAuthenticated } = useWeb3();
  const [isPlacingBid, setIsPlacingBid] = useState(false);

  const handleBidClick = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet to place bids');
      return;
    }

    const bidAmount = prompt(`Enter your ${isReverse ? 'quote' : 'bid'} amount (WKC):`);
    if (!bidAmount) return;

    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsPlacingBid(true);
    try {
      await apiService.placeBid(auctionId, amount);
      toast.success(`${isReverse ? 'Quote' : 'Bid'} placed successfully!`);
      onBidClick();
    } catch (error: any) {
      console.error('Failed to place bid:', error);
      toast.error(error.message || `Failed to place ${isReverse ? 'quote' : 'bid'}`);
    } finally {
      setIsPlacingBid(false);
    }
  };
  
  return (
    <div className={`border border-panel-border bg-secondary/20 p-3 transition-all hover:bg-secondary/30 hover:border-terminal-green/50 ${isHot ? 'animate-glow' : ''} min-w-0`}>
      <div className="text-xs">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-foreground font-medium text-sm truncate flex-1">{item}</div>
          {isHot && <div className="w-2 h-2 bg-auction-active rounded-full animate-pulse-slow"></div>}
          {isReverse && <Badge className="bg-terminal-amber/20 text-terminal-amber text-xs">REV</Badge>}
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-muted-foreground">{category}</span>
          {watchers && <span className="text-xs text-muted-foreground">{watchers} 👁️</span>}
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-terminal-green">
            {isReverse ? 'Lowest: ' : 'Current: '}{currentBid} WKC
          </span>
          <span className={`${isUrgent ? 'text-warning-flash animate-pulse' : 'text-terminal-red'}`}>
            {timeLeft}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors flex-shrink-0 min-w-0">
            Watch
          </button>
          <button 
            onClick={handleBidClick}
            disabled={isPlacingBid}
            className="bg-primary hover:bg-primary/80 px-2 py-1 text-xs text-primary-foreground transition-colors disabled:opacity-50 flex-1 min-w-0 truncate"
          >
            {isPlacingBid ? '⟳' : (isReverse ? 'Quote' : 'Bid')}
          </button>
        </div>
      </div>
    </div>
  );
};