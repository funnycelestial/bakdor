import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const AdminDashboard = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Admin Control Panel</h3>
        <Badge variant="outline" className="text-terminal-amber border-terminal-amber">
          ADMIN ACCESS
        </Badge>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-panel-border bg-secondary/20 p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">System Health</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Server Status:</span>
              <span className="text-terminal-green">ONLINE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">WebSocket:</span>
              <span className="text-terminal-green">CONNECTED</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database:</span>
              <span className="text-terminal-green">HEALTHY</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mobile Money API:</span>
              <span className="text-terminal-green">ACTIVE</span>
            </div>
          </div>
        </Card>

        <Card className="border-panel-border bg-secondary/20 p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">Platform Stats</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Users:</span>
              <span className="text-foreground">12,456</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Today:</span>
              <span className="text-terminal-green">1,234</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Auctions:</span>
              <span className="text-foreground">8,901</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue (24h):</span>
              <span className="text-terminal-green">GH₵ 45,678</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Token Management */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Token Economy</h4>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Total Tokens Issued:</span>
              <div className="text-lg font-bold text-terminal-green">2.4M WKC</div>
            </div>
            <div>
              <span className="text-muted-foreground">Tokens in Circulation:</span>
              <div className="text-lg font-bold text-terminal-amber">1.8M WKC</div>
            </div>
            <div>
              <span className="text-muted-foreground">Tokens Locked (Bids):</span>
              <div className="text-lg font-bold text-terminal-red">456K WKC</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Token Utilization</span>
              <span>75%</span>
            </div>
            <Progress value={75} className="h-2" />
          </div>
        </div>
      </Card>

      {/* Auction Management */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Auction Management</h4>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs text-terminal-green mb-2">Pending Approvals</h5>
              <div className="space-y-1">
                {[
                  { item: "iPhone 15 Pro", seller: "USER_123", value: "1000" },
                  { item: "MacBook Air M2", seller: "USER_456", value: "1500" },
                  { item: "Samsung TV 55\"", seller: "USER_789", value: "800" }
                ].map((auction, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 border border-panel-border/50 rounded">
                    <div>
                      <div className="text-foreground">{auction.item}</div>
                      <div className="text-muted-foreground">by {auction.seller}</div>
                    </div>
                    <div className="flex gap-1">
                      <button className="bg-terminal-green px-2 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors">
                        ✓
                      </button>
                      <button className="bg-terminal-red px-2 py-1 text-xs text-background hover:bg-terminal-red/80 transition-colors">
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-xs text-terminal-green mb-2">Flagged Activities</h5>
              <div className="space-y-1">
                {[
                  { type: "Suspicious Bidding", user: "USER_999", severity: "high" },
                  { type: "Multiple Accounts", user: "USER_888", severity: "medium" },
                  { type: "Payment Issue", user: "USER_777", severity: "low" }
                ].map((flag, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 border border-panel-border/50 rounded">
                    <div>
                      <div className="text-foreground">{flag.type}</div>
                      <div className="text-muted-foreground">{flag.user}</div>
                    </div>
                    <Badge className={`text-xs ${
                      flag.severity === 'high' ? 'bg-terminal-red/20 text-terminal-red' :
                      flag.severity === 'medium' ? 'bg-terminal-amber/20 text-terminal-amber' :
                      'bg-terminal-green/20 text-terminal-green'
                    }`}>
                      {flag.severity.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2">
        <button className="bg-terminal-green px-3 py-2 text-xs text-background hover:bg-terminal-green/80 transition-colors">
          Issue Tokens
        </button>
        <button className="bg-terminal-amber px-3 py-2 text-xs text-background hover:bg-terminal-amber/80 transition-colors">
          Freeze Account
        </button>
        <button className="bg-terminal-red px-3 py-2 text-xs text-background hover:bg-terminal-red/80 transition-colors">
          Emergency Stop
        </button>
        <button className="bg-secondary hover:bg-accent px-3 py-2 text-xs transition-colors">
          Export Data
        </button>
      </div>
    </div>
  );
};