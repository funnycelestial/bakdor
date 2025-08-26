import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface BidIncrementProps {
  auctionId: string;
  currentBid: number;
  minIncrement: number;
  userBalance: string;
  onBidPlaced: () => void;
}

export const BidIncrement = ({ 
  auctionId, 
  currentBid, 
  minIncrement, 
  userBalance, 
  onBidPlaced 
}: BidIncrementProps) => {
  const { isAuthenticated } = useWeb3();
  const [customAmount, setCustomAmount] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);

  const quickIncrements = [
    { label: '+1', value: minIncrement },
    { label: '+5', value: minIncrement * 5 },
    { label: '+10', value: minIncrement * 10 },
    { label: '+50', value: minIncrement * 50 }
  ];

  const handleQuickBid = async (increment: number) => {
    const newBidAmount = currentBid + increment;
    await placeBid(newBidAmount);
  };

  const handleCustomBid = async () => {
    const amount = parseFloat(customAmount);
    if (!amount || amount <= currentBid) {
      toast.error(`Bid must be higher than current bid of ${formatTokenAmount(currentBid.toString())} WKC`);
      return;
    }
    await placeBid(amount);
  };

  const placeBid = async (amount: number) => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet');
      return;
    }

    const balance = parseFloat(userBalance);
    if (amount > balance) {
      toast.error(`Insufficient balance. You have ${formatTokenAmount(userBalance)} WKC`);
      return;
    }

    setIsPlacing(true);
    try {
      await apiService.placeBid(auctionId, amount);
      toast.success(`Bid placed: ${formatTokenAmount(amount.toString())} WKC`);
      setCustomAmount('');
      onBidPlaced();
    } catch (error: any) {
      console.error('Failed to place bid:', error);
      toast.error(error.message || 'Failed to place bid');
    } finally {
      setIsPlacing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center p-3 border border-panel-border bg-secondary/20 rounded">
        <div className="text-terminal-amber mb-2">🔐</div>
        <div className="text-xs text-muted-foreground">
          Connect wallet to place bids
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Quick Bid Increments</span>
        <Badge variant="outline" className="text-xs">
          Min: +{formatTokenAmount(minIncrement.toString())} WKC
        </Badge>
      </div>

      {/* Quick Increment Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {quickIncrements.map((increment) => {
          const newAmount = currentBid + increment.value;
          const canAfford = parseFloat(userBalance) >= newAmount;
          
          return (
            <button
              key={increment.label}
              onClick={() => handleQuickBid(increment.value)}
              disabled={isPlacing || !canAfford}
              className={`p-2 text-xs border transition-all ${
                canAfford 
                  ? 'border-terminal-green bg-terminal-green/10 hover:bg-terminal-green/20 text-terminal-green' 
                  : 'border-panel-border bg-secondary/20 text-muted-foreground cursor-not-allowed'
              }`}
            >
              <div className="font-bold">{increment.label}</div>
              <div className="text-xs">
                {formatTokenAmount(newAmount.toString())}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Bid Amount */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Custom Bid Amount</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={`Min: ${formatTokenAmount((currentBid + minIncrement).toString())}`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="flex-1 bg-background border-panel-border focus:border-terminal-green"
          />
          <Button
            onClick={handleCustomBid}
            disabled={isPlacing || !customAmount || parseFloat(customAmount) <= currentBid}
            className="bg-terminal-green text-background hover:bg-terminal-green/80"
          >
            {isPlacing ? (
              <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Bid'
            )}
          </Button>
        </div>
      </div>

      {/* Balance Info */}
      <div className="flex items-center justify-between text-xs p-2 border border-panel-border bg-background/50 rounded">
        <span className="text-muted-foreground">Your Balance:</span>
        <span className="text-terminal-green font-bold">
          {formatTokenAmount(userBalance)} WKC
        </span>
      </div>

      {/* Bid Strategy Tips */}
      <div className="border border-terminal-amber/30 bg-terminal-amber/10 p-2 rounded">
        <div className="text-xs text-terminal-amber mb-1">💡 Bidding Tips</div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Bids in last 5 minutes extend auction by 5 minutes</div>
          <div>• 3% platform fee applies to winning bids</div>
          <div>• Tokens are locked until auction ends</div>
        </div>
      </div>
    </div>
  );
};