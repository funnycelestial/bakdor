import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiService, Auction } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const WatchlistManager = () => {
  const { isAuthenticated, user } = useWeb3();
  const [watchedAuctions, setWatchedAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadWatchedAuctions();
      setupRealTimeUpdates();
    }
  }, [isAuthenticated]);

  const loadWatchedAuctions = async () => {
    try {
      // Get all auctions and filter watched ones
      const response = await apiService.getAuctions({ limit: 100 });
      const watched = response.data.auctions.filter(auction => auction.isWatching);
      setWatchedAuctions(watched);
    } catch (error) {
      console.error('Failed to load watched auctions:', error);
      toast.error('Failed to load watchlist');
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealTimeUpdates = () => {
    const socket = apiService.getSocket();
    if (!socket) return;

    // Listen for bid updates on watched auctions
    socket.on('bid_update', (data) => {
      setWatchedAuctions(prev => prev.map(auction => 
        auction.auctionId === data.auctionId 
          ? { 
              ...auction, 
              pricing: { ...auction.pricing, currentBid: parseFloat(data.amount) },
              bidding: { ...auction.bidding, totalBids: auction.bidding.totalBids + 1 }
            }
          : auction
      ));

      // Show notification for watched auctions
      const watchedAuction = watchedAuctions.find(a => a.auctionId === data.auctionId);
      if (watchedAuction) {
        toast.info(`New bid on ${watchedAuction.title}`, {
          description: `${formatTokenAmount(data.amount)} WKC by ${data.bidder}`
        });
      }
    });

    // Listen for auction endings
    socket.on('auction_ended', (data) => {
      const watchedAuction = watchedAuctions.find(a => a.auctionId === data.auctionId);
      if (watchedAuction) {
        toast.success(`Watched auction ended: ${watchedAuction.title}`, {
          description: data.winner ? `Winner: ${data.winner.anonymousId}` : 'No winner'
        });
      }
      
      setWatchedAuctions(prev => prev.map(auction => 
        auction.auctionId === data.auctionId 
          ? { ...auction, status: 'ended' }
          : auction
      ));
    });
  };

  const handleUnwatch = async (auctionId: string) => {
    setActionLoading(auctionId);
    try {
      await apiService.unwatchAuction(auctionId);
      setWatchedAuctions(prev => prev.filter(auction => auction.id !== auctionId));
      toast.success('Removed from watchlist');
    } catch (error: any) {
      console.error('Failed to unwatch auction:', error);
      toast.error(error.message || 'Failed to remove from watchlist');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePlaceBid = async (auctionId: string) => {
    const auction = watchedAuctions.find(a => a.id === auctionId);
    if (!auction) return;

    const bidAmount = prompt(`Enter bid amount (min: ${auction.pricing.currentBid + 1} WKC):`);
    if (!bidAmount) return;

    const amount = parseFloat(bidAmount);
    if (amount <= auction.pricing.currentBid) {
      toast.error('Bid must be higher than current bid');
      return;
    }

    setActionLoading(auctionId);
    try {
      await apiService.placeBid(auctionId, amount);
      toast.success(`Bid placed: ${formatTokenAmount(amount.toString())} WKC`);
      await loadWatchedAuctions();
    } catch (error: any) {
      console.error('Failed to place bid:', error);
      toast.error(error.message || 'Failed to place bid');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view watchlist
          </div>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-secondary/20 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-secondary/20 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">My Watchlist</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            👁️ {watchedAuctions.length} Watching
          </Badge>
        </div>

        {/* Watchlist Summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-terminal-green">
              {watchedAuctions.filter(a => a.status === 'active').length}
            </div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div>
            <div className="text-lg font-bold text-terminal-amber">
              {watchedAuctions.filter(a => {
                const timeLeft = new Date(a.timing.endTime).getTime() - Date.now();
                return timeLeft <= 60 * 60 * 1000 && timeLeft > 0;
              }).length}
            </div>
            <div className="text-xs text-muted-foreground">Ending Soon</div>
          </div>
          <div>
            <div className="text-lg font-bold text-terminal-red">
              {watchedAuctions.filter(a => a.status === 'ended').length}
            </div>
            <div className="text-xs text-muted-foreground">Ended</div>
          </div>
        </div>

        {/* Watched Auctions */}
        <div className="space-y-3">
          {watchedAuctions.map((auction) => {
            const timeLeft = new Date(auction.timing.endTime).getTime() - Date.now();
            const isEndingSoon = timeLeft <= 60 * 60 * 1000 && timeLeft > 0;
            
            return (
              <div 
                key={auction.auctionId} 
                className={`border border-panel-border bg-secondary/20 p-3 rounded transition-all ${
                  isEndingSoon ? 'animate-glow border-terminal-red' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{auction.title}</div>
                  <div className="flex items-center gap-2">
                    {isEndingSoon && (
                      <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
                        ENDING SOON
                      </Badge>
                    )}
                    {auction.type === 'reverse' && (
                      <Badge className="bg-terminal-amber/20 text-terminal-amber">REV</Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Current Bid:</div>
                    <div className="text-terminal-green font-bold">
                      {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Bids:</div>
                    <div className="text-foreground">{auction.bidding.totalBids}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Time Left:</div>
                    <div className={`${isEndingSoon ? 'text-terminal-red animate-pulse' : 'text-terminal-red'}`}>
                      {auction.status === 'active' 
                        ? formatTimeRemaining(Math.floor(new Date(auction.timing.endTime).getTime() / 1000))
                        : 'Ended'
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Category:</div>
                    <div className="text-foreground capitalize">{auction.category}</div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                    View Details
                  </button>
                  {auction.status === 'active' && (
                    <button 
                      onClick={() => handlePlaceBid(auction.id)}
                      disabled={actionLoading === auction.id}
                      className="bg-terminal-green px-2 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === auction.id ? 'Bidding...' : 'Place Bid'}
                    </button>
                  )}
                  <button 
                    onClick={() => handleUnwatch(auction.id)}
                    disabled={actionLoading === auction.id}
                    className="bg-terminal-red/20 hover:bg-terminal-red/30 px-2 py-1 text-xs text-terminal-red transition-colors disabled:opacity-50"
                  >
                    {actionLoading === auction.id ? 'Removing...' : '👁️ Unwatch'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {watchedAuctions.length === 0 && (
          <div className="text-center py-8">
            <div className="text-terminal-amber text-2xl mb-2">👁️</div>
            <div className="text-sm text-muted-foreground">No auctions in watchlist</div>
            <div className="text-xs text-muted-foreground mt-1">
              Click the watch button on any auction to add it here
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};