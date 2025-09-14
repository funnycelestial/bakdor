import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiService, Auction } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { useWeb3 } from '@/contexts/Web3Context';
import { toast } from 'sonner';
import { BidIncrement } from '../auction/BidIncrement';

interface RealTimeAuctionsProps {
  selectedAuctionId?: string;
}

export const RealTimeAuctions = ({ selectedAuctionId }: RealTimeAuctionsProps) => {
  const { isAuthenticated, walletAddress, balance, refreshBalance, user } = useWeb3();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentBids, setRecentBids] = useState<any[]>([]);

  useEffect(() => {
    loadAuctions();
    setupRealTimeUpdates();
  }, []);

  useEffect(() => {
    if (selectedAuctionId && auctions.length > 0) {
      const auction = auctions.find(a => a.auctionId === selectedAuctionId);
      if (auction) {
        setSelectedAuction(auction);
        apiService.joinAuctionRoom(auction.auctionId);
        loadAuctionBids(auction.id);
      }
    }
  }, [selectedAuctionId, auctions]);

  const loadAuctions = async () => {
    try {
      // Use the market/live endpoint for real-time auctions
      const response = await apiService.request('/market/live?sort=ending_soon&limit=20');
      
      setAuctions(response.data.auctions || []);
      
      if (response.data.auctions?.length > 0 && !selectedAuction) {
        setSelectedAuction(response.data.auctions[0]);
        loadAuctionBids(response.data.auctions[0].id);
      }
    } catch (error) {
      console.error('Failed to load auctions:', error);
      toast.error('Failed to load live auctions');
      
      // Use fallback mock data
      const mockAuctions = [
        {
          id: '1',
          auctionId: 'AUC_001',
          title: 'iPhone 15 Pro Max 256GB',
          description: 'Brand new iPhone 15 Pro Max',
          category: 'electronics',
          type: 'forward' as const,
          seller: {
            userId: 'user1',
            anonymousId: 'ANON_123',
            reputation: 4.5
          },
          pricing: {
            startingBid: 500,
            currentBid: 1250,
            reservePrice: 1000,
            buyNowPrice: 1500,
            currency: 'WKC'
          },
          timing: {
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
            duration: 86400000
          },
          status: 'active',
          bidding: {
            totalBids: 15,
            uniqueBidders: 8,
            highestBidder: {
              anonymousId: 'ANON_456'
            }
          },
          analytics: {
            views: 156,
            watchersCount: 23
          },
          isWatching: false,
          createdAt: new Date().toISOString()
        }
      ];
      setAuctions(mockAuctions);
      setSelectedAuction(mockAuctions[0]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuctionBids = async (auctionId: string) => {
    try {
      const response = await apiService.getAuctionBids(auctionId, 10);
      setRecentBids(response.data?.bids || response.data || []);
    } catch (error) {
      console.error('Failed to load auction bids:', error);
      // Use mock data
      setRecentBids([
        {
          bidder: { anonymousId: 'ANON_7X2' },
          amount: 1250,
          timing: { placedAt: new Date().toISOString() },
          status: 'active'
        },
        {
          bidder: { anonymousId: 'GHOST_99' },
          amount: 1200,
          timing: { placedAt: new Date(Date.now() - 45000).toISOString() },
          status: 'outbid'
        }
      ]);
    }
  };

  const setupRealTimeUpdates = () => {
    const socket = apiService.getSocket();
    if (!socket) return;

    // Listen for bid updates
    socket.on('bid_update', (data) => {
      setAuctions(prev => prev.map(auction => 
        auction.auctionId === data.auctionId 
          ? { 
              ...auction, 
              pricing: { ...auction.pricing, currentBid: parseFloat(data.amount) },
              bidding: { ...auction.bidding, totalBids: auction.bidding.totalBids + 1 }
            }
          : auction
      ));

      if (selectedAuction?.auctionId === data.auctionId) {
        setSelectedAuction(prev => prev ? {
          ...prev,
          pricing: { ...prev.pricing, currentBid: parseFloat(data.amount) },
          bidding: { ...prev.bidding, totalBids: prev.bidding.totalBids + 1 }
        } : null);
        
        // Add to recent bids
        setRecentBids(prev => [{
          bidder: { anonymousId: data.bidder },
          amount: parseFloat(data.amount),
          timing: { placedAt: new Date().toISOString() },
          status: 'active'
        }, ...prev.slice(0, 9)]);
      }

      // Show notification for bids
      if (data.bidder !== user?.anonymousId) {
        toast.info(`New bid: ${formatTokenAmount(data.amount)} WKC by ${data.bidder}`);
      }
    });

    // Listen for auction endings
    socket.on('auction_ended', (data) => {
      setAuctions(prev => prev.map(auction => 
        auction.auctionId === data.auctionId 
          ? { ...auction, status: 'ended' }
          : auction
      ));

      if (selectedAuction?.auctionId === data.auctionId) {
        toast.success(`Auction ended! Winner: ${data.winner || 'No winner'}`);
      }
    });

    // Listen for new auctions
    socket.on('auction_created', (data) => {
      loadAuctions(); // Refresh auction list
      toast.info('New auction created!');
    });
  };

  const handleWatchAuction = async (auction: Auction) => {
    if (!isAuthenticated) {
      toast.error('Please connect and authenticate your wallet');
      return;
    }

    try {
      if (auction.isWatching) {
        await apiService.unwatchAuction(auction.id);
        toast.info('Removed from watchlist');
      } else {
        await apiService.watchAuction(auction.id);
        toast.success('Added to watchlist');
      }
      
      // Update local state
      setAuctions(prev => prev.map(a => 
        a.id === auction.id ? { ...a, isWatching: !a.isWatching } : a
      ));
      
      if (selectedAuction?.id === auction.id) {
        setSelectedAuction(prev => prev ? { ...prev, isWatching: !prev.isWatching } : null);
      }
    } catch (error: any) {
      console.error('Failed to toggle watch status:', error);
      toast.error(error.message || 'Failed to update watchlist');
    }
  };

  const formatTimeRemaining = (endTime: string): string => {
    const now = Date.now();
    const end = new Date(endTime).getTime();
    const remaining = end - now;
    
    if (remaining <= 0) return 'Ended';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-secondary/20 rounded"></div>
          <div className="h-32 bg-secondary/20 rounded"></div>
          <div className="h-10 bg-secondary/20 rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auction Selector */}
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-terminal-green">Live Auctions</h3>
          <Badge className="bg-terminal-green/20 text-terminal-green">
            {auctions.length} Active
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
          {auctions.map((auction) => (
            <button
              key={auction.auctionId}
              onClick={() => {
                setSelectedAuction(auction);
                apiService.joinAuctionRoom(auction.auctionId);
                loadAuctionBids(auction.id);
              }}
              className={`text-left p-2 rounded border transition-all ${
                selectedAuction?.auctionId === auction.auctionId
                  ? 'border-terminal-green bg-terminal-green/10'
                  : 'border-panel-border bg-secondary/20 hover:bg-secondary/30'
              }`}
            >
              <div className="text-xs font-medium text-foreground truncate">
                {auction.title}
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-terminal-green">
                  {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                </span>
                <span className="text-terminal-red">
                  {formatTimeRemaining(auction.timing.endTime)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">{auction.bidding.totalBids} bids</span>
                {auction.isWatching && (
                  <span className="text-xs text-terminal-amber">👁️ Watching</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Selected Auction Details */}
      {selectedAuction && (
        <Card className="border-panel-border bg-card/50 p-4">
          <div className="space-y-4">
            {/* Auction Header */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-foreground font-medium">{selectedAuction.title}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {selectedAuction.category}
                  </Badge>
                  {selectedAuction.type === 'reverse' && (
                    <Badge className="bg-terminal-amber/20 text-terminal-amber text-xs">
                      REVERSE
                    </Badge>
                  )}
                  <Badge className="bg-terminal-green/20 text-terminal-green text-xs">
                    {selectedAuction.bidding.totalBids} BIDS
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-terminal-green">
                  {formatTokenAmount(selectedAuction.pricing.currentBid.toString())} WKC
                </div>
                <div className="text-xs text-muted-foreground">
                  Current {selectedAuction.type === 'reverse' ? 'Quote' : 'Bid'}
                </div>
              </div>
            </div>

            {/* Time Remaining */}
            <div className="flex items-center justify-between p-3 border border-panel-border bg-secondary/20 rounded">
              <span className="text-sm text-muted-foreground">Time Remaining:</span>
              <span className="text-terminal-red font-bold animate-pulse-slow">
                {formatTimeRemaining(selectedAuction.timing.endTime)}
              </span>
            </div>

            {/* Recent Bids */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-live-pulse rounded-full animate-pulse-slow"></div>
                <span className="text-xs text-terminal-green">RECENT BIDS</span>
              </div>
              
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {recentBids.slice(0, 5).map((bid, index) => (
                  <div 
                    key={index}
                    className={`flex justify-between items-center p-2 rounded border border-panel-border/50 bg-secondary/20 text-xs ${
                      index === 0 ? 'animate-glow' : ''
                    }`}
                  >
                    <span className="text-foreground">{bid.bidder?.anonymousId || 'Anonymous'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-terminal-green font-bold">
                        {formatTokenAmount(bid.amount.toString())} WKC
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(bid.timing?.placedAt || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bidding Interface */}
            {isAuthenticated ? (
              <div className="space-y-3">
                <BidIncrement
                  auctionId={selectedAuction.id}
                  currentBid={selectedAuction.pricing.currentBid}
                  minIncrement={1}
                  userBalance={balance}
                  onBidPlaced={() => {
                    loadAuctionBids(selectedAuction.id);
                    refreshBalance();
                  }}
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleWatchAuction(selectedAuction)}
                    variant="outline"
                    size="sm"
                    className="text-xs border-panel-border"
                  >
                    {selectedAuction.isWatching ? '👁️ Watching' : '👁️ Watch'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-panel-border"
                  >
                    📊 Details
                  </Button>
                </div>
                
                <div className="border border-terminal-red/30 bg-terminal-red/10 p-2 rounded">
                  <div className="text-xs text-terminal-red mb-1">🔥 Auto-Burn on Win</div>
                  <div className="text-xs text-muted-foreground">
                    3% platform fee: 1.5% burned forever, 1.5% to treasury
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 border border-panel-border bg-secondary/20 rounded">
                <div className="text-terminal-amber mb-2">🔐</div>
                <div className="text-sm text-muted-foreground">
                  Connect your wallet to place bids
                </div>
              </div>
            )}

            {/* Auction Info */}
            <div className="grid grid-cols-2 gap-4 text-xs border-t border-panel-border pt-3">
              <div>
                <span className="text-muted-foreground">Seller:</span>
                <div className="text-foreground">{selectedAuction.seller.anonymousId}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Reputation:</span>
                <div className="text-terminal-green">
                  ★★★★☆ ({selectedAuction.seller.reputation.toFixed(1)})
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Starting Bid:</span>
                <div className="text-foreground">
                  {formatTokenAmount(selectedAuction.pricing.startingBid.toString())} WKC
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Reserve:</span>
                <div className="text-foreground">
                  {selectedAuction.pricing.reservePrice > 0 
                    ? `${formatTokenAmount(selectedAuction.pricing.reservePrice.toString())} WKC`
                    : 'None'
                  }
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};