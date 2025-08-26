import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';

export const AdvancedAnalytics = () => {
  const { isAuthenticated, user } = useWeb3();
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      loadAnalytics();
    }
  }, [isAuthenticated]);

  const loadAnalytics = async () => {
    try {
      // In a real implementation, this would fetch from analytics endpoints
      // For now, we'll use calculated mock data
      setAnalytics({
        bidding: {
          totalBids: 47,
          winRate: 68,
          avgBidAmount: 892,
          totalSpent: 12450,
          categories: {
            electronics: { wins: 12, total: 18, spent: 8450, success: 67 },
            fashion: { wins: 8, total: 10, spent: 2100, success: 80 },
            'home-garden': { wins: 5, total: 8, spent: 1200, success: 63 },
            sports: { wins: 3, total: 6, spent: 700, success: 50 }
          },
          timing: {
            morning: 3,
            afternoon: 5,
            evening: 4,
            night: 1
          },
          strategy: {
            earlyBird: 15,
            midAuction: 25,
            lastMinute: 60
          }
        },
        market: {
          totalVolume: 2450000,
          avgAuctionValue: 1250,
          topCategories: [
            { name: 'Electronics', volume: 890000, growth: 15.3 },
            { name: 'Fashion', volume: 450000, growth: 8.7 },
            { name: 'Collectibles', volume: 320000, growth: 22.1 }
          ],
          priceRanges: {
            under100: 25,
            '100-500': 35,
            '500-1000': 20,
            '1000-5000': 15,
            over5000: 5
          }
        },
        recommendations: [
          {
            type: 'category_focus',
            title: 'Focus on Fashion Category',
            description: 'Your Fashion category performance is excellent - focus more here',
            priority: 'medium'
          },
          {
            type: 'timing_optimization',
            title: 'Optimize Bid Timing',
            description: 'Consider bidding earlier in Electronics category to improve win rate',
            priority: 'high'
          },
          {
            type: 'budget_adjustment',
            title: 'Adjust Sports Budget',
            description: 'Reduce maximum bid limits in Sports category to improve ROI',
            priority: 'low'
          }
        ]
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">📊</div>
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view analytics
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
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">Advanced Analytics</h3>
          <Badge variant="outline" className="text-terminal-green border-terminal-green">
            AI INSIGHTS
          </Badge>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="performance" className="text-xs">Performance</TabsTrigger>
            <TabsTrigger value="market" className="text-xs">Market</TabsTrigger>
            <TabsTrigger value="patterns" className="text-xs">Patterns</TabsTrigger>
            <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            {/* Performance Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-green">
                    {analytics?.bidding.winRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-amber">
                    {formatTokenAmount(analytics?.bidding.avgBidAmount.toString())}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Bid</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">
                    {formatTokenAmount(analytics?.bidding.totalSpent.toString())}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Spent</div>
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-terminal-red">
                    {analytics?.bidding.totalBids}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Bids</div>
                </div>
              </Card>
            </div>

            {/* Category Performance */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Category Performance</h4>
              <div className="space-y-3">
                {analytics?.bidding.categories && Object.entries(analytics.bidding.categories).map(([category, data]: [string, any]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-foreground capitalize">{category}</span>
                      <span className="text-muted-foreground">
                        {data.wins}/{data.total} wins • {formatTokenAmount(data.spent.toString())} WKC
                      </span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span className={`${
                        data.success >= 70 ? 'text-terminal-green' : 
                        data.success >= 60 ? 'text-terminal-amber' : 
                        'text-terminal-red'
                      }`}>
                        {data.success}%
                      </span>
                    </div>
                    <Progress value={data.success} className="h-1" />
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="market" className="space-y-4">
            {/* Market Overview */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Market Overview</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-muted-foreground">Total Market Volume:</div>
                  <div className="text-lg font-bold text-terminal-green">
                    {formatTokenAmount(analytics?.market.totalVolume.toString())} WKC
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg Auction Value:</div>
                  <div className="text-lg font-bold text-terminal-amber">
                    {formatTokenAmount(analytics?.market.avgAuctionValue.toString())} WKC
                  </div>
                </div>
              </div>
            </Card>

            {/* Top Categories */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Top Categories by Volume</h4>
              <div className="space-y-3">
                {analytics?.market.topCategories.map((category: any, index: number) => (
                  <div key={category.name} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-foreground">{category.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-terminal-green">+{category.growth}%</span>
                        <span className="text-muted-foreground">
                          {formatTokenAmount(category.volume.toString())} WKC
                        </span>
                      </div>
                    </div>
                    <Progress value={(category.volume / analytics.market.totalVolume) * 100} className="h-1" />
                  </div>
                ))}
              </div>
            </Card>

            {/* Price Distribution */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Price Range Distribution</h4>
              <div className="space-y-2">
                {analytics?.market.priceRanges && Object.entries(analytics.market.priceRanges).map(([range, percentage]: [string, any]) => (
                  <div key={range} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground capitalize">{range.replace(/([A-Z])/g, ' $1')}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{percentage}%</span>
                      <div className="w-16 h-1 bg-secondary rounded">
                        <div 
                          className="h-full bg-terminal-green rounded" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            {/* Bidding Patterns */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-panel-border bg-secondary/20 p-3">
                <h4 className="text-sm font-medium text-foreground mb-3">Peak Activity Hours</h4>
                <div className="space-y-2 text-xs">
                  {analytics?.bidding.timing && Object.entries(analytics.bidding.timing).map(([time, level]: [string, any]) => (
                    <div key={time} className="flex justify-between">
                      <span className="capitalize">{time}</span>
                      <span className="text-terminal-green">
                        {'●'.repeat(level)}{'○'.repeat(5 - level)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              
              <Card className="border-panel-border bg-secondary/20 p-3">
                <h4 className="text-sm font-medium text-foreground mb-3">Bid Timing Strategy</h4>
                <div className="space-y-2 text-xs">
                  {analytics?.bidding.strategy && Object.entries(analytics.bidding.strategy).map(([strategy, percentage]: [string, any]) => (
                    <div key={strategy} className="flex justify-between">
                      <span className="capitalize">{strategy.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-muted-foreground">{percentage}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Bidding Behavior Analysis */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Bidding Behavior Analysis</h4>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="text-muted-foreground mb-2">Bid Frequency</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Daily Average:</span>
                      <span className="text-terminal-green">3.2 bids</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Peak Day:</span>
                      <span className="text-terminal-amber">Sunday</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consistency:</span>
                      <span className="text-terminal-green">High</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="text-muted-foreground mb-2">Risk Profile</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Risk Level:</span>
                      <span className="text-terminal-amber">Moderate</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Bid Ratio:</span>
                      <span className="text-foreground">2.3x</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Diversification:</span>
                      <span className="text-terminal-green">Good</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="text-muted-foreground mb-2">Competition</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Avg Competitors:</span>
                      <span className="text-foreground">4.7</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Win vs Top Bidder:</span>
                      <span className="text-terminal-green">73%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bid Wars Won:</span>
                      <span className="text-terminal-amber">12</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {/* AI Recommendations */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">AI-Powered Recommendations</h4>
              <div className="space-y-3">
                {analytics?.recommendations.map((rec: any, index: number) => (
                  <div key={index} className="p-3 border border-panel-border bg-background/50 rounded">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        rec.priority === 'high' ? 'bg-terminal-red' :
                        rec.priority === 'medium' ? 'bg-terminal-amber' :
                        'bg-terminal-green'
                      } animate-pulse-slow`}></span>
                      <span className="text-sm font-medium text-foreground">{rec.title}</span>
                      <Badge className={`text-xs ${
                        rec.priority === 'high' ? 'bg-terminal-red/20 text-terminal-red' :
                        rec.priority === 'medium' ? 'bg-terminal-amber/20 text-terminal-amber' :
                        'bg-terminal-green/20 text-terminal-green'
                      }`}>
                        {rec.priority.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.description}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Market Opportunities */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Market Opportunities</h4>
              <div className="space-y-2 text-xs">
                <div className="p-2 border border-terminal-green/30 bg-terminal-green/10 rounded">
                  <div className="text-terminal-green font-medium mb-1">🎯 Undervalued Category</div>
                  <div className="text-muted-foreground">
                    Books category showing 23% lower average bids - potential opportunity
                  </div>
                </div>
                
                <div className="p-2 border border-terminal-amber/30 bg-terminal-amber/10 rounded">
                  <div className="text-terminal-amber font-medium mb-1">⏰ Timing Advantage</div>
                  <div className="text-muted-foreground">
                    Tuesday 2-4 PM shows 15% fewer competing bidders
                  </div>
                </div>
                
                <div className="p-2 border border-terminal-red/30 bg-terminal-red/10 rounded">
                  <div className="text-terminal-red font-medium mb-1">🔥 Hot Trend</div>
                  <div className="text-muted-foreground">
                    Collectibles category volume up 22% - consider diversifying
                  </div>
                </div>
              </div>
            </Card>

            {/* Performance Score */}
            <Card className="border-panel-border bg-secondary/20 p-3">
              <h4 className="text-sm font-medium text-foreground mb-3">Overall Performance Score</h4>
              <div className="text-center mb-3">
                <div className="text-3xl font-bold text-terminal-green">8.7/10</div>
                <div className="text-xs text-muted-foreground">Excellent Bidder</div>
              </div>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Strategy Execution:</span>
                  <span className="text-terminal-green">9.2/10</span>
                </div>
                <div className="flex justify-between">
                  <span>Risk Management:</span>
                  <span className="text-terminal-amber">8.1/10</span>
                </div>
                <div className="flex justify-between">
                  <span>Market Timing:</span>
                  <span className="text-terminal-green">8.8/10</span>
                </div>
                <div className="flex justify-between">
                  <span>Portfolio Diversity:</span>
                  <span className="text-terminal-amber">7.9/10</span>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};