import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const AuctionAnalytics = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Auction Analytics</h3>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-panel-border bg-secondary/20 p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">My Performance</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="text-terminal-green">68%</span>
              </div>
              <Progress value={68} className="h-2" />
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Avg Bid Accuracy</span>
                <span className="text-terminal-amber">82%</span>
              </div>
              <Progress value={82} className="h-2" />
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Response Time</span>
                <span className="text-terminal-green">Fast (2.3s)</span>
              </div>
              <Progress value={90} className="h-2" />
            </div>
          </div>
        </Card>

        <Card className="border-panel-border bg-secondary/20 p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">Spending Analysis</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Spent:</span>
              <span className="text-foreground">12,450 WKC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg per Auction:</span>
              <span className="text-foreground">892 WKC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Highest Bid:</span>
              <span className="text-terminal-amber">3,200 WKC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ROI:</span>
              <span className="text-terminal-green">+15.3%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Category Performance */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Category Performance</h4>
        <div className="space-y-3">
          {[
            { category: "Electronics", wins: 12, total: 18, spent: "8,450", success: 67 },
            { category: "Fashion", wins: 8, total: 10, spent: "2,100", success: 80 },
            { category: "Home & Garden", wins: 5, total: 8, spent: "1,200", success: 63 },
            { category: "Sports", wins: 3, total: 6, spent: "700", success: 50 }
          ].map((cat, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-foreground">{cat.category}</span>
                <span className="text-muted-foreground">{cat.wins}/{cat.total} wins • {cat.spent} WKC</span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Success Rate</span>
                <span className={`${cat.success >= 70 ? 'text-terminal-green' : cat.success >= 60 ? 'text-terminal-amber' : 'text-terminal-red'}`}>
                  {cat.success}%
                </span>
              </div>
              <Progress value={cat.success} className="h-1" />
            </div>
          ))}
        </div>
      </Card>

      {/* Bidding Patterns */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Bidding Patterns</h4>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <h5 className="text-terminal-green mb-2">Peak Activity Hours</h5>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Morning (6-12)</span>
                <span className="text-terminal-green">●●●○○</span>
              </div>
              <div className="flex justify-between">
                <span>Afternoon (12-18)</span>
                <span className="text-terminal-green">●●●●●</span>
              </div>
              <div className="flex justify-between">
                <span>Evening (18-24)</span>
                <span className="text-terminal-green">●●●●○</span>
              </div>
              <div className="flex justify-between">
                <span>Night (0-6)</span>
                <span className="text-terminal-green">●○○○○</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="text-terminal-green mb-2">Bid Timing Strategy</h5>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Early Bird</span>
                <span className="text-muted-foreground">15%</span>
              </div>
              <div className="flex justify-between">
                <span>Mid Auction</span>
                <span className="text-muted-foreground">25%</span>
              </div>
              <div className="flex justify-between">
                <span>Last Minute</span>
                <span className="text-terminal-amber">60%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Recommendations */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">AI Recommendations</h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="text-terminal-green">•</span>
            <span className="text-muted-foreground">Consider bidding earlier in Electronics category to improve win rate</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-terminal-amber">•</span>
            <span className="text-muted-foreground">Your Fashion category performance is excellent - focus more here</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-terminal-red">•</span>
            <span className="text-muted-foreground">Reduce maximum bid limits in Sports category to improve ROI</span>
          </div>
        </div>
      </Card>
    </div>
  );
};