import { Layout } from '@/components/layout/Layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '@/contexts/Web3Context';
import { AuctionFilters } from '@/components/auction/AuctionFilters';
import { AuctionCard } from '@/components/auction/AuctionCard';
import { AuctionSearch } from '@/components/auction/AuctionSearch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { formatTokenAmount } from '@/utils/formatters';

const Marketplace = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useWeb3();
  const [filteredAuctions, setFilteredAuctions] = useState<any[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  const formatTimeRemaining = (endTime: string): string => {
    const now = Date.now();
    const end = new Date(endTime).getTime();
    const remaining = end - now;
    
    if (remaining <= 0) return 'Ended';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Marketplace Header */}
        <Card className="border-panel-border bg-card/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-terminal-green">The Backdoor Marketplace</h1>
              <p className="text-muted-foreground">
                Anonymous auctions powered by WikiCat Token
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
                🔥 DEFLATIONARY
              </Badge>
              {isAuthenticated ? (
                <Button 
                  onClick={() => navigate(`/${user?.anonymousId}/create`)}
                  className="bg-terminal-green text-background hover:bg-terminal-green/80"
                >
                  Create Auction
                </Button>
              ) : (
                <Button 
                  onClick={() => navigate('/')}
                  className="bg-terminal-amber text-background hover:bg-terminal-amber/80"
                >
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Marketplace Content */}
        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse">Browse Auctions</TabsTrigger>
            <TabsTrigger value="search">Advanced Search</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <AuctionFilters 
              onFiltersChange={setFilteredAuctions}
              onLoadingChange={setIsLoadingFilters}
            />
            
            {isLoadingFilters ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} className="border border-panel-border bg-secondary/20 p-4 rounded animate-pulse">
                    <div className="h-4 bg-secondary/40 rounded mb-2"></div>
                    <div className="h-8 bg-secondary/40 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAuctions.map((auction) => (
                  <div key={auction.auctionId} onClick={() => navigate(`/auction/${auction.auctionId}`)}>
                    <AuctionCard
                      auctionId={auction.auctionId}
                      item={auction.title}
                      currentBid={formatTokenAmount(auction.pricing.currentBid.toString())}
                      timeLeft={formatTimeRemaining(auction.timing.endTime)}
                      category={auction.category}
                      isHot={auction.bidding.totalBids > 10}
                      auctionType={auction.type}
                      watchers={auction.analytics?.watchersCount || 0}
                      onBidClick={() => {
                        // Refresh auctions after bid
                        setFilteredAuctions([]);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {!isLoadingFilters && filteredAuctions.length === 0 && (
              <Card className="border-panel-border bg-card/50 p-8">
                <div className="text-center space-y-4">
                  <div className="text-terminal-amber text-4xl">🔍</div>
                  <h3 className="text-xl font-bold text-foreground">No Auctions Found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your filters or check back later for new auctions.
                  </p>
                  <Button 
                    onClick={() => navigate('/')}
                    className="bg-terminal-green text-background hover:bg-terminal-green/80"
                  >
                    View Live Auctions
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="search">
            <AuctionSearch />
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Card className="border-panel-border bg-card/50 p-6">
              <h3 className="text-terminal-green mb-4">Browse by Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  { name: 'Electronics', icon: '📱', count: 23 },
                  { name: 'Fashion', icon: '👕', count: 15 },
                  { name: 'Home & Garden', icon: '🏠', count: 8 },
                  { name: 'Sports', icon: '⚽', count: 12 },
                  { name: 'Automotive', icon: '🚗', count: 6 },
                  { name: 'Books', icon: '📚', count: 4 },
                  { name: 'Art', icon: '🎨', count: 9 },
                  { name: 'Collectibles', icon: '🏆', count: 7 }
                ].map((category) => (
                  <button
                    key={category.name}
                    className="p-4 border border-panel-border bg-secondary/20 hover:bg-secondary/30 rounded transition-all hover:border-terminal-green/50"
                  >
                    <div className="text-2xl mb-2">{category.icon}</div>
                    <div className="text-sm font-medium text-foreground">{category.name}</div>
                    <div className="text-xs text-muted-foreground">{category.count} items</div>
                  </button>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Marketplace;