import { Badge } from '@/components/ui/badge';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';

export const Footer = () => {
  const { tokenInfo } = useWeb3();

  return (
    <footer className="border-t border-panel-border bg-card/50 p-4 mt-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Platform Info */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-terminal-green">Platform</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>The Backdoor - Anonymous Marketplace</div>
            <div>Powered by WikiCat Token (WKC)</div>
            <div>Deflationary Token Economy</div>
            <div>100% Transparent Operations</div>
          </div>
        </div>

        {/* Token Economics */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-terminal-green">Token Economics</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Supply:</span>
              <span className="text-foreground">
                {tokenInfo ? formatTokenAmount(tokenInfo.totalSupply) : '1B WKC'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Burned:</span>
              <span className="text-terminal-red">
                {tokenInfo ? formatTokenAmount(tokenInfo.totalBurned) : '125K WKC'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Burn Rate:</span>
              <span className="text-terminal-amber">
                {tokenInfo ? `${tokenInfo.burnRate.toFixed(2)}%` : '2.34%'}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Privacy */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-terminal-green">Security & Privacy</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-terminal-green">✓</span>
              <span>Anonymous Bidding</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-terminal-green">✓</span>
              <span>Wallet-Based Authentication</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-terminal-green">✓</span>
              <span>Smart Contract Escrow</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-terminal-green">✓</span>
              <span>Transparent Fee Structure</span>
            </div>
          </div>
        </div>

        {/* Links & Support */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-terminal-green">Support</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="hover:text-terminal-green cursor-pointer transition-colors">
              How It Works
            </div>
            <div className="hover:text-terminal-green cursor-pointer transition-colors">
              Fee Structure
            </div>
            <div className="hover:text-terminal-green cursor-pointer transition-colors">
              Security Guide
            </div>
            <div className="hover:text-terminal-green cursor-pointer transition-colors">
              Contact Support
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-panel-border mt-6 pt-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            © 2025 The Backdoor. All rights reserved.
          </div>
          
          <div className="flex items-center gap-4">
            <Badge className="bg-terminal-green/20 text-terminal-green">
              🔒 Secure
            </Badge>
            <Badge className="bg-terminal-amber/20 text-terminal-amber">
              🎭 Anonymous
            </Badge>
            <Badge className="bg-terminal-red/20 text-terminal-red">
              🔥 Deflationary
            </Badge>
          </div>
        </div>
              Every transaction on The Backdoor burns tokens forever
    </footer>
  );
};
  )
}