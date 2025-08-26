import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from '@/utils/formatters';

interface LiveBiddingPanelProps {
  auctionType: 'forward' | 'reverse';
}

export const LiveBiddingPanel = ({ auctionType }: LiveBiddingPanelProps) => {
  const [bidAmount, setBidAmount] = useState("");
  const [isHighestBidder, setIsHighestBidder] = useState(false);
  const isReverse = auctionType === 'reverse';

  const handleBid = () => {
    const amount = parseFloat(bidAmount.replace(',', ''));
    const currentBid = isReverse ? 1200 : 1250;
    
    if (bidAmount && (isReverse ? amount < currentBid : amount > currentBid)) {
      setIsHighestBidder(true);
      setTimeout(() => setIsHighestBidder(false), 3000);
    }
  };

  const currentBidData = isReverse 
    ? { amount: "1,200", label: "Lowest Quote", starter: "Starting budget: 2,000 WKC" }
    : { amount: "1,250", label: "Current Bid", starter: "Starting bid: 500 WKC" };

  const mockBids = isReverse 
    ? [
        { bidder: "DEV_42X", amount: "1,200", status: "leading" },
        { bidder: "CODE_99", amount: "1,350", status: "" },
        { bidder: "TECH_77", amount: "1,500", status: "" }
      ]
    : [
        { bidder: "ANON_7X2", amount: "1,250", status: "leading" },
        { bidder: "GHOST_99", amount: "1,200", status: "" },
        { bidder: "SHADOW_42", amount: "1,150", status: "" }
      ];

  return (
    <div className="relative h-64 border border-panel-border bg-background/50 p-4 animate-glow">
      <div className="flex h-full">
        {/* Product Image */}
        <div className="w-1/3 border border-panel-border bg-secondary/20 flex items-center justify-center relative">
          <div className="text-4xl">{isReverse ? '💻' : '📱'}</div>
          <div className="absolute top-2 right-2 w-3 h-3 bg-live-pulse rounded-full animate-pulse-slow"></div>
          {isReverse && (
            <div className="absolute top-2 left-2 text-xs bg-terminal-amber/20 text-terminal-amber px-1 rounded">
              REVERSE
            </div>
          )}
        </div>
        
        {/* Auction Info */}
        <div className="w-2/3 pl-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-bold">{currentBidData.label}: {currentBidData.amount} WKC</span>
              {isHighestBidder && (
                <Badge className="bg-terminal-green text-background animate-pulse">
                  {isReverse ? "LOWEST QUOTE!" : "YOU'RE WINNING!"}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{currentBidData.starter}</div>
            <div className="text-xs mt-1 text-terminal-red">Time: 4m 37s</div>
          </div>
          
          {/* Live Bidding */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-live-pulse rounded-full animate-pulse-slow"></div>
              <span className="text-xs text-terminal-green">
                {isReverse ? "LIVE QUOTES:" : "LIVE BIDDING:"}
              </span>
            </div>
            
            <div className="space-y-1 text-xs max-h-20 overflow-y-auto">
              {mockBids.map((bid, index) => (
                <div 
                  key={index}
                  className={`flex justify-between p-1 rounded ${bid.status === 'leading' ? 'bg-terminal-green/10 animate-glow' : ''}`}
                >
                  <span>{bid.bidder}</span>
                  <span className={bid.status === 'leading' ? 'text-terminal-green' : ''}>{bid.amount} WKC</span>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2 mt-2">
              <input 
                className="flex-1 bg-secondary/20 border border-panel-border px-2 py-1 text-xs focus:border-terminal-green focus:outline-none transition-colors" 
                placeholder={isReverse ? "Enter quote amount..." : "Enter bid amount..."}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
              <button 
                onClick={handleBid}
                className="bg-terminal-green px-3 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors"
              >
                {isReverse ? "QUOTE" : "BID"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};