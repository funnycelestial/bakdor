import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const TokenEconomics = () => {
  const { tokenInfo, refreshTokenInfo } = useWeb3();
  const [burnStats, setBurnStats] = useState<any>(null);
  const [treasuryData, setTreasuryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadTokenEconomics();
  }, []);

  const loadTokenEconomics = async () => {
    try {
      const [burnResponse, treasuryResponse] = await Promise.all([
        apiService.getBurnStats('30d'),
        apiService.request('/tokens/treasury')
      ]);

      setBurnStats(burnResponse.data);
      setTreasuryData(treasuryResponse.data.treasury);
    } catch (error) {
      console.error('Failed to load token economics:', error);
      // Use mock data
      setBurnStats({
        totalBurned: 125000,
        burnCount: 1247,
        tokenomics: {
          deflationaryPressure: 2.34,
          circulatingSupply: '875000000'
        }
      });
      setTreasuryData({
        currentBalance: 125000,
        totalIncome: 250000,
        address: '0x1111222233334444555566667777888899990000'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadTokenEconomics(),
        refreshTokenInfo()
      ]);
      toast.success('Token economics refreshed');
    } catch (error) {
      toast.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyTreasuryAddress = () => {
    if (treasuryData?.address) {
      navigator.clipboard.writeText(treasuryData.address);
      toast.success('Treasury address copied');
    }
  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-secondary/20 rounded"></div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-secondary/20 rounded"></div>
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
            <h3 className="text-terminal-green">Token Economics</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
              DEFLATIONARY
            </Badge>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="text-xs border-panel-border"
            >
              {isRefreshing ? '⟳' : '↻'}
            </Button>
          </div>
        </div>

        {/* Token Supply Overview */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">
                {tokenInfo ? formatTokenAmount(tokenInfo.totalSupply) : '1B'}
              </div>
              <div className="text-xs text-muted-foreground">Total Supply</div>
            </div>
          </Card>
          
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-green">
                {tokenInfo ? formatTokenAmount(tokenInfo.circulatingSupply) : '875M'}
              </div>
              <div className="text-xs text-muted-foreground">Circulating</div>
            </div>
          </Card>
          
          <Card className="border-panel-border bg-secondary/20 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-terminal-red">
                {burnStats ? formatTokenAmount(burnStats.totalBurned.toString()) : '125K'}
              </div>
              <div className="text-xs text-muted-foreground">Burned Forever</div>
            </div>
          </Card>
        </div>

        {/* Burn Mechanism */}
        <Card className="border-panel-border bg-secondary/20 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">🔥 Burn Mechanism</h4>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Every successful auction automatically burns 50% of platform fees, permanently reducing token supply.
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-bold text-terminal-red">
                  {burnStats ? burnStats.burnCount : '1,247'}
                </div>
                <div className="text-xs text-muted-foreground">Burn Events (30d)</div>
              </div>
              <div>
                <div className="text-sm font-bold text-terminal-amber">
                  {tokenInfo ? `${tokenInfo.burnRate.toFixed(2)}%` : '2.34%'}
                </div>
                <div className="text-xs text-muted-foreground">Burn Rate</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Deflationary Progress</span>
                <span className="text-terminal-red">
                  {burnStats?.tokenomics?.deflationaryPressure || '2.34'}%
                </span>
              </div>
              <Progress value={parseFloat(burnStats?.tokenomics?.deflationaryPressure || '2.34')} className="h-2" />
            </div>
          </div>
        </Card>

        {/* Treasury Information */}
        <Card className="border-panel-border bg-secondary/20 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">🏛️ Treasury</h4>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              50% of platform fees go to the treasury for platform development and sustainability.
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-bold text-terminal-green">
                  {treasuryData ? formatTokenAmount(treasuryData.currentBalance.toString()) : '125K'}
                </div>
                <div className="text-xs text-muted-foreground">Current Balance</div>
              </div>
              <div>
                <div className="text-sm font-bold text-terminal-amber">
                  {treasuryData ? formatTokenAmount(treasuryData.totalIncome.toString()) : '250K'}
                </div>
                <div className="text-xs text-muted-foreground">Total Income</div>
              </div>
            </div>

            <div className="p-2 border border-panel-border bg-background/50 rounded">
              <div className="text-xs text-muted-foreground mb-1">Treasury Address:</div>
              <button 
                onClick={copyTreasuryAddress}
                className="text-xs text-foreground font-mono hover:text-terminal-green transition-colors"
              >
                {treasuryData?.address ? 
                  `${treasuryData.address.slice(0, 10)}...${treasuryData.address.slice(-6)}` :
                  '0x1111...0000'
                }
              </button>
            </div>
          </div>
        </Card>

        {/* Fee Structure */}
        <Card className="border-panel-border bg-secondary/20 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">💰 Fee Structure</h4>
          <div className="space-y-3">
            <div className="p-3 border border-terminal-green/30 bg-terminal-green/10 rounded">
              <div className="text-sm text-terminal-green mb-2">Platform Fee: 3%</div>
              <div className="text-xs text-muted-foreground">
                Applied to all successful auction transactions
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-terminal-red/30 bg-terminal-red/10 rounded">
                <div className="text-sm text-terminal-red mb-1">50% Burned 🔥</div>
                <div className="text-xs text-muted-foreground">
                  Permanently removed from circulation
                </div>
              </div>
              
              <div className="p-3 border border-terminal-amber/30 bg-terminal-amber/10 rounded">
                <div className="text-sm text-terminal-amber mb-1">50% Treasury 🏛️</div>
                <div className="text-xs text-muted-foreground">
                  Platform development & operations
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <strong>Example:</strong> On a 1,000 WKC auction win:
              <ul className="mt-1 space-y-1 ml-4">
                <li>• Platform fee: 30 WKC (3%)</li>
                <li>• Burned: 15 WKC (reduces supply)</li>
                <li>• Treasury: 15 WKC (platform growth)</li>
                <li>• Seller receives: 970 WKC</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </Card>
  );
};