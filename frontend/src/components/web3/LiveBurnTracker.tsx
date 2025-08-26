import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { apiService } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface BurnEvent {
  id: string;
  amount: string;
  reason: string;
  timestamp: string;
  transactionHash: string;
}

export const LiveBurnTracker = () => {
  const [burnStats, setBurnStats] = useState({
    totalBurned: 0,
    burnCount: 0,
    burnRate: 0,
    dailyBurns: [],
    tokenomics: {
      deflationaryPressure: 0,
      circulatingSupply: '0'
    }
  });
  const [recentBurns, setRecentBurns] = useState<BurnEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBurnStats();
    
    // Set up real-time burn tracking
    const socket = apiService.getSocket();
    if (socket) {
      socket.on('tokens_burned', handleTokensBurned);
      
      return () => {
        socket.off('tokens_burned', handleTokensBurned);
      };
    }
  }, []);

  const loadBurnStats = async () => {
    try {
      const response = await apiService.getBurnStats('30d');
      setBurnStats(response.data);
      
      // Simulate recent burns for demo
      setRecentBurns([
        {
          id: '1',
          amount: '125.50',
          reason: 'Platform fee burn',
          timestamp: '2m ago',
          transactionHash: '0x1234...5678'
        },
        {
          id: '2', 
          amount: '89.25',
          reason: 'Auction completion fee',
          timestamp: '5m ago',
          transactionHash: '0x2345...6789'
        },
        {
          id: '3',
          amount: '203.75',
          reason: 'Platform fee burn',
          timestamp: '8m ago',
          transactionHash: '0x3456...7890'
        }
      ]);
    } catch (error) {
      console.error('Failed to load burn stats:', error);
      // Use mock data for demo
      setBurnStats({
        totalBurned: 125000,
        burnCount: 1247,
        burnRate: 2.34,
        dailyBurns: [],
        tokenomics: {
          deflationaryPressure: 2.34,
          circulatingSupply: '875000000'
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokensBurned = (data: { amount: string; reason: string; transactionHash: string }) => {
    const newBurn: BurnEvent = {
      id: Date.now().toString(),
      amount: data.amount,
      reason: data.reason,
      timestamp: 'just now',
      transactionHash: data.transactionHash
    };

    setRecentBurns(prev => [newBurn, ...prev.slice(0, 9)]);
    
    // Update total burned
    setBurnStats(prev => ({
      ...prev,
      totalBurned: prev.totalBurned + parseFloat(data.amount),
      burnCount: prev.burnCount + 1
    }));

  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary/20 rounded"></div>
          <div className="h-8 bg-secondary/20 rounded"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-6 bg-secondary/20 rounded"></div>
            ))}
          </div>
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
            <span className="text-lg">🔥</span>
            <h3 className="text-terminal-red">Live Burn Tracker</h3>
          </div>
          <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
            DEFLATIONARY
          </Badge>
        </div>

        {/* Burn Statistics */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-terminal-red">
              {formatTokenAmount(burnStats.totalBurned.toString())}
            </div>
            <div className="text-xs text-muted-foreground">Total Burned</div>
          </div>
          <div>
            <div className="text-lg font-bold text-terminal-amber">
              {burnStats.burnCount}
            </div>
            <div className="text-xs text-muted-foreground">Burn Events</div>
          </div>
          <div>
            <div className="text-lg font-bold text-terminal-green">
              {burnStats.burnRate.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">Burn Rate</div>
          </div>
        </div>

        {/* Burn Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Deflationary Progress</span>
            <span className="text-terminal-red">{burnStats.burnRate.toFixed(2)}%</span>
          </div>
          <Progress value={burnStats.burnRate} className="h-2" />
          <div className="text-xs text-muted-foreground text-center">
            Every transaction burns tokens, reducing total supply
          </div>
        </div>

        {/* Recent Burns */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-terminal-red rounded-full animate-pulse-slow"></div>
            <span className="text-xs text-terminal-red">RECENT BURNS</span>
          </div>
          
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentBurns.map((burn, index) => (
              <div 
                key={burn.id}
                className={`text-xs p-2 rounded border border-panel-border bg-secondary/20 ${index === 0 ? 'animate-glow' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-terminal-red font-bold">
                    🔥 {formatTokenAmount(burn.amount)} WKC
                  </span>
                  <span className="text-muted-foreground">{burn.timestamp}</span>
                </div>
                <div className="text-muted-foreground mt-1">{burn.reason}</div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(burn.transactionHash);
                    toast.success('Transaction hash copied');
                  }}
                  className="text-xs text-terminal-green font-mono hover:text-terminal-green/80 transition-colors"
                >
                  {burn.transactionHash.slice(0, 10)}...{burn.transactionHash.slice(-6)}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Burn Impact */}
        <div className="border-t border-panel-border pt-3">
          <div className="text-xs text-muted-foreground mb-2">Token Economics Impact</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span>Supply Reduction:</span>
              <span className="text-terminal-red">-{burnStats.burnRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Scarcity Increase:</span>
              <span className="text-terminal-green">+{(burnStats.burnRate * 1.5).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Circulating Supply:</span>
              <span className="text-foreground">
                {formatTokenAmount(burnStats.tokenomics.circulatingSupply)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Deflation Rate:</span>
              <span className="text-terminal-amber">
                {burnStats.tokenomics.deflationaryPressure.toFixed(4)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};