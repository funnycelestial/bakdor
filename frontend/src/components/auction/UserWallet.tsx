import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from '@/utils/formatters';


export const UserWallet = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">WIKICAT TOKENS (WKC)</span>
        <Badge className="bg-terminal-green/20 text-terminal-green text-xs">VERIFIED</Badge>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs">Available Balance</span>
          <span className="text-xs text-terminal-green animate-pulse-slow font-bold">2,450 WKC</span>
        </div>
        <Progress value={85} className="h-1" />
        
        <div className="flex items-center justify-between">
          <span className="text-xs">Pending Bids</span>
          <span className="text-xs text-terminal-amber">680 WKC</span>
        </div>
        <Progress value={30} className="h-1" />
        
        <div className="flex items-center justify-between">
          <span className="text-xs">Won (Pending Payment)</span>
          <span className="text-xs text-terminal-red">320 WKC</span>
        </div>
        <Progress value={15} className="h-1" />
      </div>

      <div className="border-t border-panel-border pt-2 mt-3">
        <div className="text-xs text-muted-foreground mb-2">Recent Transactions</div>
        <div className="space-y-1">
          {[
            { type: "bid", amount: "-50", item: "iPhone 15", time: "2m ago" },
            { type: "topup", amount: "+500", item: "MTN MoMo", time: "1h ago" },
            { type: "win", amount: "-320", item: "MacBook Pro", time: "3h ago" }
          ].map((tx, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  tx.type === 'bid' ? 'bg-terminal-amber' : 
                  tx.type === 'topup' ? 'bg-terminal-green' : 'bg-terminal-red'
                }`}></span>
                <span className="text-muted-foreground">{tx.item}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${tx.amount.startsWith('+') ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  {tx.amount} WKC
                </span>
                <span className="text-muted-foreground">{tx.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};