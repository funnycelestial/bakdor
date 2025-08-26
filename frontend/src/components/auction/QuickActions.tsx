import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWeb3 } from '@/contexts/Web3Context';
import { apiService } from '@/lib/api';
import { toast } from 'sonner';

export const QuickActions = () => {
  const { isAuthenticated, user, balance, refreshBalance } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);

  const quickActions = [
    {
      id: 'ending-soon',
      title: '🔥 Ending Soon',
      description: 'Auctions ending in < 1 hour',
      action: async () => {
        try {
          const response = await apiService.getAuctions({ 
            status: 'active',
            sort: 'ending_soon',
            limit: 20 
          });
          
          const endingSoon = response.data.auctions.filter(auction => {
            const timeLeft = new Date(auction.timing.endTime).getTime() - Date.now();
            return timeLeft <= 60 * 60 * 1000 && timeLeft > 0;
          });
          
          toast.success(`Found ${endingSoon.length} auctions ending soon`);
        } catch (error) {
          toast.error('Failed to load ending soon auctions');
        }
      }
    },
    {
      id: 'hot-electronics',
      title: '📱 Hot Electronics',
      description: 'Trending tech auctions',
      action: async () => {
        try {
          const response = await apiService.getAuctions({ 
            category: 'electronics',
            sort: 'most_bids',
            limit: 20 
          });
          toast.success(`Found ${response.data.auctions.length} hot electronics`);
        } catch (error) {
          toast.error('Failed to load electronics');
        }
      }
    },
    {
      id: 'buy-now',
      title: '⚡ Buy Now Available',
      description: 'Skip bidding wars',
      action: async () => {
        try {
          const response = await apiService.getAuctions({ 
            status: 'active',
            limit: 50 
          });
          
          const buyNowAuctions = response.data.auctions.filter(auction => 
            auction.pricing.buyNowPrice > 0
          );
          
          toast.success(`Found ${buyNowAuctions.length} buy now auctions`);
        } catch (error) {
          toast.error('Failed to load buy now auctions');
        }
      }
    },
    {
      id: 'reverse-auctions',
      title: '🔄 Reverse Auctions',
      description: 'Submit quotes for services',
      action: async () => {
        try {
          const response = await apiService.getAuctions({ 
            type: 'reverse',
            status: 'active',
            limit: 20 
          });
          toast.success(`Found ${response.data.auctions.length} reverse auctions`);
        } catch (error) {
          toast.error('Failed to load reverse auctions');
        }
      }
    },
    {
      id: 'my-activity',
      title: '📊 My Activity',
      description: 'View your auction stats',
      action: async () => {
        if (!isAuthenticated) {
          toast.error('Please connect your wallet');
          return;
        }
        
        try {
          const [bidsResponse, auctionsResponse] = await Promise.all([
            apiService.getMyBids({ limit: 100 }),
            apiService.getAuctions({ seller: user?.id, limit: 100 })
          ]);
          
          const totalBids = bidsResponse.data.bids.length;
          const wonBids = bidsResponse.data.bids.filter(b => b.status === 'won').length;
          const winRate = totalBids > 0 ? ((wonBids / totalBids) * 100).toFixed(1) : '0';
          
          toast.success(`Your Stats: ${totalBids} bids, ${winRate}% win rate`);
        } catch (error) {
          toast.error('Failed to load your activity');
        }
      }
    },
    {
      id: 'refresh-balance',
      title: '💰 Refresh Balance',
      description: 'Update token balance',
      action: async () => {
        if (!isAuthenticated) {
          toast.error('Please connect your wallet');
          return;
        }
        
        try {
          await refreshBalance();
          toast.success('Balance refreshed');
        } catch (error) {
          toast.error('Failed to refresh balance');
        }
      }
    }
  ];

  const handleQuickAction = async (actionId: string) => {
    setIsLoading(true);
    const action = quickActions.find(a => a.id === actionId);
    if (action) {
      await action.action();
    }
    setIsLoading(false);
  };

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">Quick Actions</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            SHORTCUTS
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleQuickAction(action.id)}
              disabled={isLoading}
              className="p-3 border border-panel-border bg-secondary/20 hover:bg-secondary/30 rounded text-left transition-all hover:border-terminal-green/50 disabled:opacity-50"
            >
              <div className="text-sm font-medium text-foreground mb-1">
                {action.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {action.description}
              </div>
            </button>
          ))}
        </div>

        {/* User Stats Quick View */}
        {isAuthenticated && (
          <div className="border-t border-panel-border pt-3">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <div className="text-terminal-green font-bold">
                  {user?.profile.reputation.toFixed(1)}★
                </div>
                <div className="text-muted-foreground">Reputation</div>
              </div>
              <div>
                <div className="text-terminal-amber font-bold">
                  {user?.profile.wonAuctions}
                </div>
                <div className="text-muted-foreground">Won</div>
              </div>
              <div>
                <div className="text-terminal-red font-bold">
                  {user?.profile.successRate}%
                </div>
                <div className="text-muted-foreground">Success</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};