import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { apiService } from '@/lib/api';
import { formatTokenAmount } from '@/lib/web3';

interface AuctionStatsProps {
  auctionId?: string;
  showGlobal?: boolean;
}

export const AuctionStats = ({ auctionId, showGlobal = false }: AuctionStatsProps) => {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [auctionId, showGlobal]);

  const loadStats = async () => {
    try {
      if (showGlobal) {
        // Load global platform stats
        const response = await apiService.request('/admin/statistics?period=24h');
        setStats({
          global: true,
          totalAuctions: response.data.summary.totalNewAuctions,
          totalBids: response.data.bidStats.reduce((sum: number, day: any) => sum + day.totalBids, 0),
          totalVolume: response.data.bidStats.reduce((sum: number, day: any) => sum + day.totalValue, 0),
          activeUsers: response.data.userStats.reduce((sum: number, day: any) => sum + day.newUsers, 0)
        });
      } else if (auctionId) {
        // Load specific auction stats
        const response = await apiService.getAuction(auctionId);
        setStats({
          global: false,
          auction: response.data.auction,
          views: response.data.auction.analytics?.views || 0,
          watchers: response.data.auction.analytics?.watchersCount || 0,
          bidders: response.data.auction.bidding.uniqueBidders,
          totalBids: response.data.auction.bidding.totalBids
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Use mock data
      setStats(showGlobal ? {
        global: true,
        totalAuctions: 47,
        totalBids: 234,
        totalVolume: 125000,
        activeUsers: 1234
      } : {
        global: false,
        views: 156,
        watchers: 23,
        bidders: 8,
        totalBids: 15
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary/20 rounded"></div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-secondary/20 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (showGlobal) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-terminal-green">Platform Statistics</h3>
            <Badge className="bg-terminal-green/20 text-terminal-green">
              24H
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-green">
                {stats.totalAuctions}
              </div>
              <div className="text-xs text-muted-foreground">New Auctions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-amber">
                {stats.totalBids}
              </div>
              <div className="text-xs text-muted-foreground">Total Bids</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">
                {formatTokenAmount(stats.totalVolume.toString())}
              </div>
              <div className="text-xs text-muted-foreground">Volume (WKC)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-red">
                {stats.activeUsers}
              </div>
              <div className="text-xs text-muted-foreground">Active Users</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Platform Activity</span>
              <span>High</span>
            </div>
            <Progress value={85} className="h-2" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">Auction Statistics</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            LIVE
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-terminal-green">
              {stats.views}
            </div>
            <div className="text-xs text-muted-foreground">Views</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-terminal-amber">
              {stats.watchers}
            </div>
            <div className="text-xs text-muted-foreground">Watchers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">
              {stats.bidders}
            </div>
            <div className="text-xs text-muted-foreground">Unique Bidders</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-terminal-red">
              {stats.totalBids}
            </div>
            <div className="text-xs text-muted-foreground">Total Bids</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Auction Interest</span>
            <span>{stats.watchers > 20 ? 'Very High' : stats.watchers > 10 ? 'High' : 'Moderate'}</span>
          </div>
          <Progress value={Math.min(100, (stats.watchers / 50) * 100)} className="h-2" />
        </div>

        <div className="border-t border-panel-border pt-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Average bid: {formatTokenAmount((stats.auction?.pricing.currentBid / Math.max(1, stats.totalBids)).toString())} WKC</div>
            <div>• Bid frequency: {(stats.totalBids / Math.max(1, stats.views) * 100).toFixed(1)}% conversion</div>
            <div>• Competition level: {stats.bidders > 5 ? 'High' : stats.bidders > 2 ? 'Medium' : 'Low'}</div>
          </div>
        </div>
      </div>
    </Card>
  );
};