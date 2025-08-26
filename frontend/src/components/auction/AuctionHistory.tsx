import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService, Auction } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount, formatTimeRemaining } from '@/lib/web3';
import { toast } from 'sonner';

export const AuctionHistory = () => {
  const { isAuthenticated, user } = useWeb3();
  const [endedAuctions, setEndedAuctions] = useState<Auction[]>([]);
  const [wonAuctions, setWonAuctions] = useState<Auction[]>([]);
  const [soldAuctions, setSoldAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (isAuthenticated) {
      loadAuctionHistory();
    }
  }, [isAuthenticated, filter]);

  const loadAuctionHistory = async () => {
    try {
      const [endedResponse, bidsResponse, myAuctionsResponse] = await Promise.all([
        apiService.getAuctions({ status: 'ended', limit: 50 }),
        apiService.getMyBids({ status: 'won', limit: 50 }),
        apiService.getAuctions({ seller: user?.id, status: 'ended', limit: 50 })
      ]);

      setEndedAuctions(endedResponse.data.auctions);
      setSoldAuctions(myAuctionsResponse.data.auctions);
      
      // Extract won auctions from bids
      const wonAuctionIds = bidsResponse.data.bids.map((bid: any) => bid.auction.auctionRef);
      const wonAuctionsData = endedResponse.data.auctions.filter((auction: Auction) => 
        wonAuctionIds.includes(auction.id)
      );
      setWonAuctions(wonAuctionsData);

    } catch (error) {
      console.error('Failed to load auction history:', error);
      toast.error('Failed to load auction history');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ended': return 'bg-muted text-muted-foreground';
      case 'won': return 'bg-green-500/20 text-green-400';
      case 'sold': return 'bg-terminal-green/20 text-terminal-green';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view auction history
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
          <h3 className="text-terminal-green">Auction History</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            {endedAuctions.length} Total
          </Badge>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs">
              All ({endedAuctions.length})
            </TabsTrigger>
            <TabsTrigger value="won" className="text-xs">
              Won ({wonAuctions.length})
            </TabsTrigger>
            <TabsTrigger value="sold" className="text-xs">
              Sold ({soldAuctions.length})
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3">
            {endedAuctions.map((auction) => (
              <div key={auction.auctionId} className="border border-panel-border bg-secondary/20 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{auction.title}</div>
                  <Badge className={getStatusColor('ended')}>
                    ENDED
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Final Bid:</div>
                    <div className="text-terminal-green font-bold">
                      {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Bids:</div>
                    <div className="text-foreground">{auction.bidding.totalBids}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Winner:</div>
                    <div className="text-foreground">
                      {auction.bidding.highestBidder?.anonymousId || 'No winner'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Ended:</div>
                    <div className="text-foreground">
                      {new Date(auction.timing.endTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="won" className="space-y-3">
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

          <TabsContent value="sold" className="space-y-3">
            {soldAuctions.map((auction) => (
              <div key={auction.auctionId} className="border border-terminal-amber bg-terminal-amber/10 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-foreground">{auction.title}</div>
                  <Badge className="bg-terminal-amber/20 text-terminal-amber">
                    SOLD
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Sale Price:</div>
                    <div className="text-terminal-green font-bold">
                      {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Buyer:</div>
                    <div className="text-foreground">
                      {auction.bidding.highestBidder?.anonymousId || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button className="bg-terminal-amber px-2 py-1 text-xs text-background hover:bg-terminal-amber/80 transition-colors">
                    View Escrow
                  </button>
                  <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                    Contact Buyer
                  </button>
                </div>
              </div>
            ))}
            
            {soldAuctions.length === 0 && (
              <div className="text-center py-8">
                <div className="text-terminal-amber text-2xl mb-2">💰</div>
                <div className="text-sm text-muted-foreground">No auctions sold yet</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-panel-border bg-secondary/20 p-3">
                <h4 className="text-sm font-medium text-foreground mb-3">Buying Performance</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Auctions Won:</span>
                    <span className="text-terminal-green">{wonAuctions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Spent:</span>
                    <span className="text-foreground">
                      {formatTokenAmount(wonAuctions.reduce((sum, a) => sum + a.pricing.currentBid, 0).toString())} WKC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Win:</span>
                    <span className="text-terminal-amber">
                      {wonAuctions.length > 0 
                        ? formatTokenAmount((wonAuctions.reduce((sum, a) => sum + a.pricing.currentBid, 0) / wonAuctions.length).toString())
                        : '0'
                      } WKC
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="border-panel-border bg-secondary/20 p-3">
                <h4 className="text-sm font-medium text-foreground mb-3">Selling Performance</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Auctions Sold:</span>
                    <span className="text-terminal-green">{soldAuctions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Earned:</span>
                    <span className="text-foreground">
                      {formatTokenAmount(soldAuctions.reduce((sum, a) => sum + a.pricing.currentBid, 0).toString())} WKC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Sale:</span>
                    <span className="text-terminal-amber">
                      {soldAuctions.length > 0 
                        ? formatTokenAmount((soldAuctions.reduce((sum, a) => sum + a.pricing.currentBid, 0) / soldAuctions.length).toString())
                        : '0'
                      } WKC
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Overall Performance</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Success Rate</span>
                    <span className="text-terminal-green">{user?.profile.successRate}%</span>
                  </div>
                  <Progress value={user?.profile.successRate || 0} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Reputation Score</span>
                    <span className="text-terminal-amber">{user?.profile.reputation.toFixed(1)}/5.0</span>
                  </div>
                  <Progress value={(user?.profile.reputation || 0) * 20} className="h-2" />
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};