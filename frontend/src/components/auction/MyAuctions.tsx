import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService, Auction, Bid } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const MyAuctions = () => {
  const { isAuthenticated, user } = useWeb3();
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [wonAuctions, setWonAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadMyData();
    }
  }, [isAuthenticated]);

  const loadMyData = async () => {
    try {
      const [auctionsResponse, bidsResponse] = await Promise.all([
        apiService.getAuctions({ seller: user?.id, limit: 50 }),
        apiService.getMyBids({ limit: 50 })
      ]);

      setMyAuctions(auctionsResponse.data.auctions);
      setMyBids(bidsResponse.data.bids);
      
      // Filter won auctions from bids
      const wonBids = bidsResponse.data.bids.filter(bid => bid.status === 'won');
      // In a real implementation, you'd fetch the full auction details for won items
      setWonAuctions([]);
      
    } catch (error) {
      console.error('Failed to load user data:', error);
      toast.error('Failed to load your auctions and bids');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseAuction = async (auctionId: string) => {
    setActionLoading(auctionId);
    try {
      await apiService.request(`/auctions/${auctionId}/close`, { method: 'POST' });
      await loadMyData();
      toast.success('Auction closed successfully');
    } catch (error: any) {
      console.error('Failed to close auction:', error);
      toast.error(error.message || 'Failed to close auction');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdrawBid = async (bidId: string) => {
    setActionLoading(bidId);
    try {
      await apiService.request(`/bids/${bidId}`, { method: 'DELETE' });
      await loadMyData();
      toast.success('Bid withdrawn successfully');
    } catch (error: any) {
      console.error('Failed to withdraw bid:', error);
      toast.error(error.message || 'Failed to withdraw bid');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-terminal-green/20 text-terminal-green';
      case 'pending': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'ended': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-terminal-red/20 text-terminal-red';
      case 'winning': return 'bg-terminal-green/20 text-terminal-green';
      case 'outbid': return 'bg-terminal-red/20 text-terminal-red';
      case 'won': return 'bg-green-500/20 text-green-400';
      case 'lost': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view your auctions
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
          <div className="h-32 bg-secondary/20 rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">My Auctions & Bids</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            {user?.anonymousId}
          </Badge>
        </div>

        <Tabs defaultValue="my-auctions" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="my-auctions" className="text-xs">
              My Auctions ({myAuctions.length})
            </TabsTrigger>
            <TabsTrigger value="my-bids" className="text-xs">
              My Bids ({myBids.length})
            </TabsTrigger>
            <TabsTrigger value="won-items" className="text-xs">
              Won Items ({wonAuctions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-auctions" className="space-y-3">
            {myAuctions.map((auction) => (
              <div key={auction.auctionId} className="border border-panel-border bg-secondary/20 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{auction.title}</div>
                  <Badge className={getStatusColor(auction.status)}>
                    {auction.status.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
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
                    <div className="text-muted-foreground">Time Remaining:</div>
                    <div className="text-terminal-red">
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
                      onClick={() => handleCloseAuction(auction.auctionId)}
                      disabled={actionLoading === auction.auctionId}
                      className="bg-terminal-red px-2 py-1 text-xs text-background hover:bg-terminal-red/80 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === auction.auctionId ? 'Closing...' : 'Close Early'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {myAuctions.length === 0 && (
              <div className="text-center py-8">
                <div className="text-terminal-amber text-2xl mb-2">📦</div>
                <div className="text-sm text-muted-foreground">No auctions created yet</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-bids" className="space-y-3">
            {myBids.map((bid) => (
              <div key={bid.bidId} className="border border-panel-border bg-secondary/20 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{bid.auction.title}</div>
                  <Badge className={getStatusColor(bid.status)}>
                    {bid.status.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">My Bid:</div>
                    <div className="text-terminal-green font-bold">
                      {formatTokenAmount(bid.amount.toString())} WKC
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Placed:</div>
                    <div className="text-foreground">
                      {new Date(bid.placedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Auction Status:</div>
                    <div className="text-foreground">{bid.auction.status}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">End Time:</div>
                    <div className="text-terminal-red">
                      {formatTimeRemaining(Math.floor(new Date(bid.auction.endTime).getTime() / 1000))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                    View Auction
                  </button>
                  {(bid.status === 'active' || bid.status === 'outbid') && bid.auction.status === 'active' && (
                    <button 
                      onClick={() => handleWithdrawBid(bid.bidId)}
                      disabled={actionLoading === bid.bidId}
                      className="bg-terminal-red/20 hover:bg-terminal-red/30 px-2 py-1 text-xs text-terminal-red transition-colors disabled:opacity-50"
                    >
                      {actionLoading === bid.bidId ? 'Withdrawing...' : 'Withdraw Bid'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {myBids.length === 0 && (
              <div className="text-center py-8">
                <div className="text-terminal-amber text-2xl mb-2">💰</div>
                <div className="text-sm text-muted-foreground">No bids placed yet</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="won-items" className="space-y-3">
            {wonAuctions.map((auction) => (
              <div key={auction.auctionId} className="border border-terminal-green bg-terminal-green/10 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{auction.title}</div>
                  <Badge className="bg-green-500/20 text-green-400">
                    WON
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Winning Bid:</div>
                    <div className="text-terminal-green font-bold">
                      {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Won Date:</div>
                    <div className="text-foreground">
                      {new Date(auction.timing.endTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button className="bg-terminal-green px-2 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors">
                    View Escrow
                  </button>
                  <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                    Contact Seller
                  </button>
                </div>
              </div>
            ))}
            
            {wonAuctions.length === 0 && (
              <div className="text-center py-8">
                <div className="text-terminal-green text-2xl mb-2">🏆</div>
                <div className="text-sm text-muted-foreground">No auctions won yet</div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};