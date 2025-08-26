import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/utils/formatters';

export const Header = () => {
  const { isAuthenticated, user, balance, tokenInfo, connectWallet, disconnectWallet } = useWeb3();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="border-b border-panel-border bg-card/50 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Logo and Status */}
        <div className="flex items-center gap-3">
          <div className="text-lg lg:text-xl font-bold text-foreground">
            █ THE BACKDOOR █
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-live-pulse rounded-full animate-pulse-slow"></div>
            <span className="text-xs text-terminal-green animate-pulse-slow">LIVE</span>
          </div>
          {tokenInfo && (
            <Badge className="bg-terminal-red/20 text-terminal-red animate-pulse-slow">
              🔥 {tokenInfo.burnRate.toFixed(2)}% BURNED
            </Badge>
          )}
        </div>

        {/* Navigation and User Info */}
        <div className="flex items-center justify-between lg:justify-end gap-4">
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex gap-4 text-sm">
            <span className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors">
              Live
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              Ending Soon
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              Bids
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              Won
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              Watchlist
            </span>
          </nav>

          {/* User Info and Wallet */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <div className="text-sm text-terminal-green">
                  {user?.anonymousId} • {user?.profile.reputation.toFixed(1)}★
                </div>
                <Badge className="bg-terminal-green/20 text-terminal-green">
                  {formatTokenAmount(balance)} WKC
                </Badge>
                <Button
                  onClick={disconnectWallet}
                  variant="outline"
                  size="sm"
                  className="text-xs border-terminal-red text-terminal-red hover:bg-terminal-red/10"
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                onClick={connectWallet}
                className="bg-terminal-green text-background hover:bg-terminal-green/80"
              >
                Connect Wallet
              </Button>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-2 border border-panel-border bg-secondary/20 hover:bg-secondary/30 transition-colors"
            >
              <div className="w-4 h-4 flex flex-col justify-between">
                <div className="w-full h-0.5 bg-foreground"></div>
                <div className="w-full h-0.5 bg-foreground"></div>
                <div className="w-full h-0.5 bg-foreground"></div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {showMobileMenu && (
        <nav className="lg:hidden mt-4 pt-4 border-t border-panel-border">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors p-2">
              Live
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
              Ending Soon
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
              Bids
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
              Won
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
              Watchlist
            </span>
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
              Analytics
            </span>
          </div>
        </nav>
      )}
    </header>
  );
};