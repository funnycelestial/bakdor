import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService, Auction } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { BidIncrement } from './BidIncrement';
import { toast } from 'sonner';

interface AuctionDetailsProps {
  auctionId: string;
  onClose: () => void;
}

export const AuctionDetails = ({ auctionId, onClose }: AuctionDetailsProps) => {
  const { isAuthenticated, user, balance, refreshBalance } = useWeb3();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [recentBids, setRecentBids] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWatching, setIsWatching] = useState(false);

  useEffect(() => {
    loadAuctionDetails();
    setupRealTimeUpdates();
  }, [auctionId]);

  const loadAuctionDetails = async () => {
    try {
      const [auctionResponse, bidsResponse] = await Promise.all([
        apiService.getAuction(auctionId),
        apiService.request(`/auctions/${auctionId}/bids?limit=20`)
      ]);

      setAuction(auctionResponse.data.auction);
      setRecentBids(bidsResponse.data.bids);
      setIsWatching(auctionResponse.data.auction.isWatching || false);
    } catch (error) {
      console.error('Failed to load auction details:', error);
      toast.error('Failed to load auction details');
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealTimeUpdates = () => {
    const socket = apiService.getSocket();
    if (!socket) return;

    apiService.joinAuctionRoom(auctionId);

    socket.on('bid_update', (data) => {
      if (data.auctionId === auctionId) {
        setAuction(prev => prev ? {
          ...prev,
          pricing: { ...prev.pricing, currentBid: parseFloat(data.amount) },
          bidding: { ...prev.bidding, totalBids: prev.bidding.totalBids + 1 }
        } : null);

        setRecentBids(prev => [{
          bidder: { anonymousId: data.bidder },
          amount: parseFloat(data.amount),
          timing: { placedAt: new Date().toISOString() },
          status: 'active'
        }, ...prev.slice(0, 19)]);
      }
    });

    socket.on('auction_ended', (data) => {
      if (data.auctionId === auctionId) {
        setAuction(prev => prev ? { ...prev, status: 'ended' } : null);
        toast.success('Auction has ended!');
      }
    });

    return () => {
      apiService.leaveAuctionRoom(auctionId);
    };
  };

  const handleWatch = async () => {
    try {
      if (isWatching) {
        await apiService.unwatchAuction(auctionId);
        setIsWatching(false);
        toast.info('Removed from watchlist');
      } else {
        await apiService.watchAuction(auctionId);
        setIsWatching(true);
        toast.success('Added to watchlist');
      }
    } catch (error: any) {
      console.error('Failed to toggle watch status:', error);
      toast.error(error.message || 'Failed to update watchlist');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-terminal-green/20 text-terminal-green';
      case 'pending': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'ended': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-terminal-red/20 text-terminal-red';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-secondary/20 rounded"></div>
          <div className="h-32 bg-secondary/20 rounded"></div>
          <div className="h-20 bg-secondary/20 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!auction) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-red text-lg">❌</div>
          <div className="text-sm text-muted-foreground">Auction not found</div>
          <Button onClick={onClose} variant="outline" size="sm">
            Go Back
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="outline" size="sm" className="text-xs">
              ← Back
            </Button>
            <h3 className="text-terminal-green">Auction Details</h3>
          </div>
          <Badge className={getStatusColor(auction.status)}>
            {auction.status.toUpperCase()}
          </Badge>
        </div>

        {/* Auction Info */}
        <div className="space-y-3">
          <div>
            <h4 className="text-lg font-medium text-foreground">{auction.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {auction.category}
              </Badge>
              {auction.type === 'reverse' && (
                <Badge className="bg-terminal-amber/20 text-terminal-amber text-xs">
                  REVERSE
                </Badge>
              )}
              <Badge className="bg-terminal-green/20 text-terminal-green text-xs">
                {auction.bidding.totalBids} BIDS
              </Badge>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {auction.description}
          </div>
        </div>

        <Tabs defaultValue="bidding" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bidding" className="text-xs">Bidding</TabsTrigger>
            <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
            <TabsTrigger value="seller" className="text-xs">Seller</TabsTrigger>
          </TabsList>

          <TabsContent value="bidding" className="space-y-4">
            {/* Current Bid Info */}
            <Card className="border-panel-border bg-secondary/20 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Current Bid</div>
                  <div className="text-2xl font-bold text-terminal-green">
                    {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Time Remaining</div>
                  <div className="text-xl font-bold text-terminal-red">
                    {auction.status === 'active' 
                      ? formatTimeRemaining(Math.floor(new Date(auction.timing.endTime).getTime() / 1000))
                      : 'Ended'
                    }
                  </div>
                </div>
              </div>

              {auction.pricing.reservePrice > 0 && (
                <div className="mt-3 p-2 border border-terminal-amber/30 bg-terminal-amber/10 rounded">
                  <div className="text-xs text-terminal-amber">
                    Reserve Price: {formatTokenAmount(auction.pricing.reservePrice.toString())} WKC
                    {auction.pricing.currentBid >= auction.pricing.reservePrice ? ' ✓ Met' : ' ⚠️ Not Met'}
                  </div>
                </div>
              )}

              {auction.pricing.buyNowPrice > 0 && (
                <div className="mt-2">
                  <Button className="w-full bg-terminal-amber text-background hover:bg-terminal-amber/80">
                    Buy Now - {formatTokenAmount(auction.pricing.buyNowPrice.toString())} WKC
                  </Button>
                </div>
              )}
            </Card>

            {/* Bidding Interface */}
            {auction.status === 'active' && (
              <BidIncrement
                auctionId={auction.id}
                currentBid={auction.pricing.currentBid}
                minIncrement={1}
                userBalance={balance}
                onBidPlaced={() => {
                  loadAuctionDetails();
                  refreshBalance();
                }}
              />
            )}

            {/* Watch Button */}
            {isAuthenticated && (
              <Button
                onClick={handleWatch}
                variant="outline"
                className="w-full border-panel-border"
              >
                {isWatching ? '👁️ Watching' : '👁️ Watch Auction'}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Auction Information</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-muted-foreground">Auction ID:</div>
                  <div className="text-foreground font-mono">{auction.auctionId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Type:</div>
                  <div className="text-foreground capitalize">{auction.type} Auction</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Starting Bid:</div>
                  <div className="text-foreground">
                    {formatTokenAmount(auction.pricing.startingBid.toString())} WKC
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Duration:</div>
                  <div className="text-foreground">
                    {Math.floor(auction.timing.duration / (1000 * 60 * 60))} hours
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Started:</div>
                  <div className="text-foreground">
                    {new Date(auction.timing.startTime).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Ends:</div>
                  <div className="text-foreground">
                    {new Date(auction.timing.endTime).toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Bid History</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentBids.map((bid, index) => (
                  <div 
                    key={index}
                    className={`flex justify-between items-center p-2 rounded border border-panel-border/50 bg-background/50 text-xs ${
                      index === 0 ? 'animate-glow' : ''
                    }`}
                  >
                    <div>
                      <div className="text-foreground">{bid.bidder.anonymousId}</div>
                      <div className="text-muted-foreground">
                        {new Date(bid.timing.placedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-terminal-green font-bold">
                        {formatTokenAmount(bid.amount.toString())} WKC
                      </div>
                      <Badge className={`text-xs ${
                        bid.status === 'winning' ? 'bg-terminal-green/20 text-terminal-green' :
                        bid.status === 'outbid' ? 'bg-terminal-red/20 text-terminal-red' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {bid.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="seller" className="space-y-4">
            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Seller Information</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-terminal-green/20 rounded-full flex items-center justify-center">
                    <span className="text-terminal-green text-lg">🎭</span>
                  </div>
                  <div>
                    <div className="text-foreground font-medium">{auction.seller.anonymousId}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-terminal-green">★★★★☆</span>
                      <span className="text-xs text-muted-foreground">
                        ({auction.seller.reputation.toFixed(1)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Total Auctions:</div>
                    <div className="text-foreground">47</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Success Rate:</div>
                    <div className="text-terminal-green">94%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Member Since:</div>
                    <div className="text-foreground">Jan 2024</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Verified:</div>
                    <div className="text-terminal-green">✓ Yes</div>
                  </div>
                </div>

                <div className="border-t border-panel-border pt-3">
                  <div className="text-xs text-muted-foreground mb-2">Recent Feedback</div>
                  <div className="space-y-2">
                    {[
                      { rating: 5, comment: "Excellent seller, fast shipping!", buyer: "USER_123" },
                      { rating: 4, comment: "Good condition as described", buyer: "USER_456" },
                      { rating: 5, comment: "Perfect transaction", buyer: "USER_789" }
                    ].map((feedback, i) => (
                      <div key={i} className="p-2 border border-panel-border/50 bg-background/50 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-terminal-green">
                            {'★'.repeat(feedback.rating)}{'☆'.repeat(5 - feedback.rating)}
                          </span>
                          <span className="text-muted-foreground">{feedback.buyer}</span>
                        </div>
                        <div className="text-xs text-foreground">{feedback.comment}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};