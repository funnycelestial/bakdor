import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletConnection } from "./web3/WalletConnection";
import { RealTimeAuctions } from "./web3/RealTimeAuctions";
import { LiveBurnTracker } from "./web3/LiveBurnTracker";
import { TransparencyDashboard } from "./web3/TransparencyDashboard";
import { useWeb3 } from "@/contexts/Web3Context";
import { LiveBiddingPanel } from "./auction/LiveBiddingPanel";
import { LiveActivityFeed } from "./auction/LiveActivityFeed";
import { TokenBalance } from "./auction/TokenBalance";
import { AuctionCard } from "./auction/AuctionCard";
import { EscrowPanel } from "./auction/EscrowPanel";
import { DisputePanel } from "./auction/DisputePanel";
import { NotificationPanel } from "./auction/NotificationPanel";
import { PaymentGateway } from "./auction/PaymentGateway";
import { SecurityPanel } from "./auction/SecurityPanel";
import { UserWallet } from "./auction/UserWallet";
import { AuctionAnalytics } from "./auction/AuctionAnalytics";
import { AuctionSearch } from "./auction/AuctionSearch";
import { CreateAuction } from "./auction/CreateAuction";
import { MyAuctions } from "./auction/MyAuctions";
import { AuctionFilters } from "./auction/AuctionFilters";
import { RealTimeNotifications } from "./web3/RealTimeNotifications";
import { BidHistory } from "./auction/BidHistory";
import { WatchlistManager } from "./auction/WatchlistManager";
import { AdvancedAnalytics } from "./auction/AdvancedAnalytics";
import { QuickActions } from "./auction/QuickActions";
import { useState, useEffect } from "react";
import { formatTokenAmount } from "@/utils/formatters";
import { apiService } from "@/lib/api";

const formatTimeRemaining = (endTimeMs: number): string => {
  const now = Date.now();
  const remaining = endTimeMs - now;
  
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

const AuctionDashboard = () => {
  const { isAuthenticated, user, tokenInfo } = useWeb3();
  const [filteredAuctions, setFilteredAuctions] = useState<any[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [endingSoonAuctions, setEndingSoonAuctions] = useState<any[]>([]);
  const [marketStats, setMarketStats] = useState<any>(null);

  useEffect(() => {
    loadEndingSoonAuctions();
    loadMarketStats();
  }, []);

  const loadEndingSoonAuctions = async () => {
    try {
      const response = await apiService.getEndingSoonAuctions(1, 10);
      setEndingSoonAuctions(response.data.auctions || []);
    } catch (error) {
      console.error('Failed to load ending soon auctions:', error);
      // Use mock data as fallback
      setEndingSoonAuctions([
        {
          auctionId: "AUC_001",
          title: "iPhone 15 Pro Max 256GB",
          category: "electronics",
          pricing: { currentBid: 1250 },
          timing: { endTime: new Date(Date.now() + 4 * 60 * 1000).toISOString() },
          bidding: { totalBids: 15 },
          analytics: { watchersCount: 23 },
          status: 'active'
        },
        {
          auctionId: "AUC_002",
          title: "MacBook Pro M3 14\"",
          category: "electronics",
          pricing: { currentBid: 2850 },
          timing: { endTime: new Date(Date.now() + 12 * 60 * 1000).toISOString() },
          bidding: { totalBids: 23 },
          analytics: { watchersCount: 45 },
          status: 'active'
        }
      ]);
    }
  };

  const loadMarketStats = async () => {
    try {
      const response = await apiService.getMarketOverview();
      setMarketStats(response.data);
    } catch (error) {
      console.error('Failed to load market stats:', error);
      // Use mock data
      setMarketStats({
        users: { total: 12456, active: 1234 },
        auctions: { total: 8901, active: 47, successRate: 73 },
        tokens: { inPlay: 45678, burnedToday: 1234 },
        volume: { last24Hours: 125000 },
        bidding: { totalBids: 15678, averageBid: 892 }
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 font-terminal text-foreground">
      {/* Header */}
      <div className="mb-6 border border-panel-border bg-card/50 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-lg lg:text-xl font-bold text-foreground">█ THE BACKDOOR █</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-live-pulse rounded-full animate-pulse-slow"></div>
              <span className="text-xs text-terminal-green animate-pulse-slow">LIVE</span>
            </div>
            {tokenInfo && (
              <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
                🔥 {tokenInfo.burnRate.toFixed(2)}% BURNED
              </Badge>
            )}
          </div>
          <div className="hidden lg:flex gap-4 text-sm">
            <span className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors">Live</span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Ending Soon</span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Bids</span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Won</span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Watchlist</span>
            {isAuthenticated && (
              <span className="text-terminal-green">
                {user?.anonymousId} • {user?.profile.reputation.toFixed(1)}★
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Panel - User Profile & Wallet */}
        <div className="lg:col-span-3 order-2 lg:order-1">
          {/* Web3 Wallet Connection */}
          <div className="mb-4">
            <WalletConnection />
          </div>
          
          {/* Live Burn Tracker */}
          <div className="mb-4">
            <LiveBurnTracker />
          </div>
          
          {/* Notifications Panel */}
          {isAuthenticated && (
            <Card className="border-panel-border bg-card/50 p-4 mb-4">
              <RealTimeNotifications />
            </Card>
          )}
          
          {/* Security Panel */}
          {isAuthenticated && (
            <Card className="border-panel-border bg-card/50 p-4">
              <SecurityPanel />
            </Card>
          )}
        </div>

        {/* Center Panel - Main Auction Interface */}
        <div className="lg:col-span-6 order-1 lg:order-2">
          <Card className="border-panel-border bg-card/50 p-4">
            <Tabs defaultValue="marketplace" className="w-full">
              <div className="overflow-x-auto">
                <TabsList className="grid w-full grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1 min-w-max">
                  <TabsTrigger value="live-auctions" className="text-xs px-1 sm:px-3 sm:text-sm">Live</TabsTrigger>
                  <TabsTrigger value="marketplace" className="text-xs px-1 sm:px-3 sm:text-sm">Market</TabsTrigger>
                  <TabsTrigger value="search" className="text-xs px-1 sm:px-3 sm:text-sm">Search</TabsTrigger>
                  <TabsTrigger value="create" className="text-xs px-1 sm:px-3 sm:text-sm">Create</TabsTrigger>
                  <TabsTrigger value="my-auctions" className="text-xs px-1 sm:px-3 sm:text-sm hidden sm:block">Items</TabsTrigger>
                  <TabsTrigger value="watchlist" className="text-xs px-1 sm:px-3 sm:text-sm hidden sm:block">Watch</TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs px-1 sm:px-3 sm:text-sm hidden lg:block">Analytics</TabsTrigger>
                  <TabsTrigger value="transparency" className="text-xs px-1 sm:px-3 sm:text-sm hidden md:block">Data</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="live-auctions" className="space-y-4">
                <RealTimeAuctions />
              </TabsContent>
              
              <TabsContent value="marketplace" className="space-y-4">
                <div className="space-y-4">
                  <AuctionFilters 
                    onFiltersChange={setFilteredAuctions}
                    onLoadingChange={setIsLoadingFilters}
                  />
                  
                  {isLoadingFilters ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="border border-panel-border bg-secondary/20 p-3 rounded animate-pulse">
                          <div className="h-4 bg-secondary/40 rounded mb-2"></div>
                          <div className="h-8 bg-secondary/40 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredAuctions.map((auction) => (
                        <AuctionCard
                          key={auction.auctionId}
                          auctionId={auction.auctionId}
                          item={auction.title}
                          currentBid={formatTokenAmount(auction.pricing.currentBid.toString())}
                          timeLeft={formatTimeRemaining(new Date(auction.timing.endTime).getTime())}
                          category={auction.category}
                          isHot={auction.bidding.totalBids > 10}
                          auctionType={auction.type}
                          watchers={auction.analytics?.watchersCount || 0}
                          onBidClick={() => {
                            // Refresh auctions after bid
                            setFilteredAuctions([]);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="search" className="space-y-4">
                <AuctionSearch />
              </TabsContent>
              
              <TabsContent value="create" className="space-y-4">
                <CreateAuction />
              </TabsContent>
              
              <TabsContent value="my-auctions" className="space-y-4">
                <MyAuctions />
              </TabsContent>
              
              <TabsContent value="watchlist" className="space-y-4">
                <WatchlistManager />
              </TabsContent>
              
              <TabsContent value="analytics" className="space-y-4">
                <AdvancedAnalytics />
              </TabsContent>
              
              <TabsContent value="transparency">
                <TransparencyDashboard />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Right Panel - Active Auctions & Market Info */}
        <div className="lg:col-span-3 order-3">
          {/* Quick Actions */}
          <div className="mb-4">
            <QuickActions />
          </div>
          
          <Card className="border-panel-border bg-card/50 p-4 mb-4">
            <div className="mb-4 flex items-center justify-between border-b border-panel-border pb-2">
              <h3 className="text-terminal-green">Market Overview</h3>
              <Badge variant="outline" className="text-terminal-green border-terminal-green">
                LIVE
              </Badge>
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Auctions:</span>
                <span className="text-terminal-green">{marketStats?.auctions?.active || 47}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Bidders:</span>
                <span className="text-terminal-green">{marketStats?.users?.active || 1234}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens in Play:</span>
                <span className="text-terminal-amber">{formatTokenAmount(marketStats?.tokens?.inPlay?.toString() || '45678')} WKC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg. Bid Value:</span>
                <span className="text-foreground">{formatTokenAmount(marketStats?.bidding?.averageBid?.toString() || '892')} WKC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Success Rate:</span>
                <span className="text-terminal-green">{marketStats?.auctions?.successRate || 73}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens Burned Today:</span>
                <span className="text-terminal-red">🔥 {formatTokenAmount(marketStats?.tokens?.burnedToday?.toString() || '1234')} WKC</span>
              </div>
            </div>
          </Card>

          <Card className="border-panel-border bg-card/50 p-4">
            <div className="mb-4 flex items-center justify-between border-b border-panel-border pb-2">
              <h3 className="text-terminal-green">Ending Soon</h3>
              <Badge variant="destructive" className="bg-terminal-red/20 text-terminal-red">URGENT</Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Don't miss these auctions ending in the next hour
            </p>

            <div className="space-y-3">
              {endingSoonAuctions.map((auction, i) => (
                <AuctionCard
                  key={auction.auctionId || i}
                  auctionId={auction.auctionId}
                  item={auction.title}
                  currentBid={formatTokenAmount(auction.pricing.currentBid.toString())}
                  timeLeft={formatTimeRemaining(new Date(auction.timing.endTime).getTime())}
                  category={auction.category}
                  isHot={auction.bidding.totalBids > 10}
                  auctionType={auction.type || "forward"}
                  watchers={auction.analytics?.watchersCount || 0}
                  onBidClick={() => {}}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AuctionDashboard;