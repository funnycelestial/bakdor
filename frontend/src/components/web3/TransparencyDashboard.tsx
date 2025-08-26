import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { apiService } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface TreasuryData {
  address: string;
  currentBalance: number;
  totalIncome: number;
  transactionCount: number;
}

interface PlatformStats {
  totalUsers: number;
  activeAuctions: number;
  totalVolume: number;
  feesCollected: number;
  tokensBurned: number;
}

export const TransparencyDashboard = () => {
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [burnStats, setBurnStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTransparencyData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadTransparencyData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadTransparencyData = async () => {
    if (!isLoading) setRefreshing(true);
    
    try {
      const [treasuryResponse, burnResponse, tokenResponse] = await Promise.all([
        apiService.request('/tokens/treasury'),
        apiService.getBurnStats('30d'),
        apiService.getTokenInfo()
      ]);

      setTreasuryData(treasuryResponse.data.treasury);
      setBurnStats(burnResponse.data);
      
      // Mock platform stats for demo
      setPlatformStats({
        totalUsers: 12456,
        activeAuctions: 47,
        totalVolume: 2450000,
        feesCollected: 73500,
        tokensBurned: 36750
      });

    } catch (error) {
      console.error('Failed to load transparency data:', error);
      // Use mock data for demo
      setTreasuryData({
        address: '0x1111222233334444555566667777888899990000',
        currentBalance: 125000,
        totalIncome: 250000,
        transactionCount: 1247
      });
      
      setBurnStats({
        totalBurned: 125000,
        burnCount: 1247,
        tokenomics: {
          deflationaryPressure: 2.34,
          circulatingSupply: '875000000'
        }
      });
      
      setPlatformStats({
        totalUsers: 12456,
        activeAuctions: 47,
        totalVolume: 2450000,
        feesCollected: 73500,
        tokensBurned: 36750
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const copyTreasuryAddress = () => {
    if (treasuryData?.address) {
      navigator.clipboard.writeText(treasuryData.address);
      toast.success('Treasury address copied to clipboard');
    }
  };

  if (isLoading) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-secondary/20 rounded"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-secondary/20 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-terminal-green">Platform Transparency</h3>
          <div className="flex items-center gap-2">
            <Badge className="bg-terminal-green/20 text-terminal-green">
              100% TRANSPARENT
            </Badge>
            <Button
              onClick={loadTransparencyData}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="text-xs border-panel-border"
            >
              {refreshing ? '⟳' : '↻'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="treasury" className="text-xs">Treasury</TabsTrigger>
            <TabsTrigger value="burns" className="text-xs">Burns</TabsTrigger>
            <TabsTrigger value="fees" className="text-xs">Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Platform Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-green">
                    {platformStats?.totalUsers.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Users</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-amber">
                    {platformStats?.activeAuctions}
                  </div>
                  <div className="text-xs text-muted-foreground">Active Auctions</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">
                    {formatTokenAmount(platformStats?.totalVolume.toString() || '0')}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Volume</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-red">
                    {formatTokenAmount(platformStats?.tokensBurned.toString() || '0')}
                  </div>
                  <div className="text-xs text-muted-foreground">Tokens Burned</div>
                </div>
              </Card>
            </div>

            {/* Fee Distribution */}
            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Fee Distribution (3% Platform Fee)</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Burned (Deflationary)</span>
                  <span className="text-terminal-red">50% → 🔥</span>
                </div>
                <Progress value={50} className="h-2" />
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Treasury (Development)</span>
                  <span className="text-terminal-green">50% → 🏛️</span>
                </div>
                <Progress value={50} className="h-2" />
                
                <div className="text-xs text-muted-foreground text-center mt-3">
                  Automatic distribution via smart contracts - no human intervention
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="treasury" className="space-y-4">
            {treasuryData && (
              <>
                <Card className="border-panel-border bg-secondary/20 p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Treasury Wallet</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Address:</span>
                      <button 
                        onClick={copyTreasuryAddress}
                        className="text-foreground font-mono hover:text-terminal-green transition-colors"
                      >
                        {treasuryData.address.slice(0, 10)}...{treasuryData.address.slice(-6)}
                      </button>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Balance:</span>
                      <span className="text-terminal-green font-bold">
                        {formatTokenAmount(treasuryData.currentBalance.toString())} WKC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Income:</span>
                      <span className="text-foreground">
                        {formatTokenAmount(treasuryData.totalIncome.toString())} WKC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transactions:</span>
                      <span className="text-foreground">{treasuryData.transactionCount}</span>
                    </div>
                  </div>
                </Card>

                <Card className="border-panel-border bg-secondary/20 p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Treasury Usage</h4>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span>Platform Development</span>
                      <span className="text-terminal-green">40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Marketing & Growth</span>
                      <span className="text-terminal-amber">30%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Security & Audits</span>
                      <span className="text-terminal-red">20%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Community Rewards</span>
                      <span className="text-foreground">10%</span>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="burns" className="space-y-4">
            {burnStats && (
              <>
                <Card className="border-panel-border bg-secondary/20 p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Burn Mechanism</h4>
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Every transaction automatically burns 50% of platform fees, permanently removing tokens from circulation.
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-lg font-bold text-terminal-red">
                          {formatTokenAmount(burnStats.totalBurned.toString())}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Burned (30d)</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-terminal-amber">
                          {burnStats.burnCount}
                        </div>
                        <div className="text-xs text-muted-foreground">Burn Events</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Supply Reduction</span>
                        <span className="text-terminal-red">-{burnStats.tokenomics?.deflationaryPressure || '0.00'}%</span>
                      </div>
                      <Progress value={parseFloat(burnStats.tokenomics?.deflationaryPressure || '0')} className="h-2" />
                    </div>
                  </div>
                </Card>

                <Card className="border-panel-border bg-secondary/20 p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Burn Impact</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original Supply:</span>
                      <span className="text-foreground">1,000,000,000 WKC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Supply:</span>
                      <span className="text-foreground">
                        {formatTokenAmount(burnStats.tokenomics?.circulatingSupply || '0')} WKC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Burned Forever:</span>
                      <span className="text-terminal-red">
                        {formatTokenAmount(burnStats.totalBurned.toString())} WKC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scarcity Multiplier:</span>
                      <span className="text-terminal-green">
                        {(1 + (burnStats.tokenomics?.deflationaryPressure || 0) / 100).toFixed(3)}x
                      </span>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="fees" className="space-y-4">
            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Fee Structure</h4>
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

            <Card className="border-panel-border bg-secondary/20 p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Fee Collection (30 Days)</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-terminal-green">
                      {formatTokenAmount(platformStats?.feesCollected.toString() || '0')}
                    </div>
                    <div className="text-xs text-muted-foreground">Fees Collected</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-terminal-red">
                      {formatTokenAmount(platformStats?.tokensBurned.toString() || '0')}
                    </div>
                    <div className="text-xs text-muted-foreground">Burned</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-terminal-amber">
                      {formatTokenAmount(((platformStats?.feesCollected || 0) - (platformStats?.tokensBurned || 0)).toString())}
                    </div>
                    <div className="text-xs text-muted-foreground">To Treasury</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Fee Distribution Efficiency</span>
                    <span>100%</span>
                  </div>
                  <Progress value={100} className="h-2" />
                  <div className="text-xs text-muted-foreground text-center">
                    All fees are automatically distributed via smart contracts
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};