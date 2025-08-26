import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiService, Bid } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const BidHistory = () => {
  const { isAuthenticated, user } = useWeb3();
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({
    totalBids: 0,
    totalSpent: 0,
    winRate: 0,
    avgBidAmount: 0
  });

  useEffect(() => {
    if (isAuthenticated) {
      loadBidHistory();
    }
  }, [isAuthenticated, filter]);

  const loadBidHistory = async () => {
    try {
      const params: any = { limit: 50 };
      if (filter !== 'all') params.status = filter;

      const response = await apiService.getMyBids(params);
      setBids(response.data.bids);
      
      // Calculate stats
      const totalBids = response.data.bids.length;
      const totalSpent = response.data.bids.reduce((sum, bid) => sum + bid.amount, 0);
      const wonBids = response.data.bids.filter(bid => bid.status === 'won').length;
      const winRate = totalBids > 0 ? (wonBids / totalBids) * 100 : 0;
      const avgBidAmount = totalBids > 0 ? totalSpent / totalBids : 0;

      setStats({
        totalBids,
        totalSpent,
        winRate,
        avgBidAmount
      });

    } catch (error) {
      console.error('Failed to load bid history:', error);
      toast.error('Failed to load bid history');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'winning': return 'bg-terminal-green/20 text-terminal-green';
      case 'won': return 'bg-green-500/20 text-green-400';
      case 'outbid': return 'bg-terminal-red/20 text-terminal-red';
      case 'lost': return 'bg-muted text-muted-foreground';
      case 'active': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'cancelled': return 'bg-terminal-red/20 text-terminal-red';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'winning': return '🏆';
      case 'won': return '✅';
      case 'outbid': return '⚡';
      case 'lost': return '❌';
      case 'active': return '⏳';
      case 'cancelled': return '🚫';
      default: return '📊';
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view bid history
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
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-secondary/20 rounded"></div>
            ))}
          </div>
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
          <h3 className="text-terminal-green">Bid History & Analytics</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            {stats.totalBids} Total Bids
          </Badge>
        </div>

        {/* Statistics Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-green">
                {formatTokenAmount(stats.totalSpent.toString())}
              </div>
              <div className="text-xs text-muted-foreground">Total Spent</div>
            </div>
          </Card>
          
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-amber">
                {stats.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
          </Card>
          
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">
                {formatTokenAmount(stats.avgBidAmount.toString())}
              </div>
              <div className="text-xs text-muted-foreground">Avg Bid</div>
            </div>
          </Card>
          
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-red">
                {stats.totalBids}
              </div>
              <div className="text-xs text-muted-foreground">Total Bids</div>
            </div>
          </Card>
        </div>

        {/* Performance Metrics */}
        <Card className="border-panel-border bg-secondary/20 p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">Performance Metrics</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="text-terminal-green">{stats.winRate.toFixed(1)}%</span>
              </div>
              <Progress value={stats.winRate} className="h-2" />
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Bid Efficiency</span>
                <span className="text-terminal-amber">78%</span>
              </div>
              <Progress value={78} className="h-2" />
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Response Speed</span>
                <span className="text-terminal-green">Fast (2.3s avg)</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>
          </div>
        </Card>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {[
            { key: 'all', label: 'All Bids', count: stats.totalBids },
            { key: 'winning', label: 'Winning', count: bids.filter(b => b.status === 'winning').length },
            { key: 'outbid', label: 'Outbid', count: bids.filter(b => b.status === 'outbid').length },
            { key: 'won', label: 'Won', count: bids.filter(b => b.status === 'won').length },
            { key: 'lost', label: 'Lost', count: bids.filter(b => b.status === 'lost').length }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1 text-xs border transition-all ${
                filter === tab.key
                  ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                  : 'border-panel-border bg-secondary/20 text-muted-foreground hover:bg-secondary/30'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Bid List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {bids.map((bid) => (
            <div key={bid.bidId} className="border border-panel-border bg-secondary/20 p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-foreground">{bid.auction.title}</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getStatusIcon(bid.status)}</span>
                  <Badge className={getStatusColor(bid.status)}>
                    {bid.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
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
                    {new Date(bid.auction.endTime).toLocaleDateString()}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mt-2">
                <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                  View Auction
                </button>
                {bid.status === 'won' && (
                  <button className="bg-terminal-green px-2 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors">
                    View Escrow
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {bids.length === 0 && (
          <div className="text-center py-8">
            <div className="text-terminal-amber text-2xl mb-2">💰</div>
            <div className="text-sm text-muted-foreground">
              {filter === 'all' ? 'No bids placed yet' : `No ${filter} bids`}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};