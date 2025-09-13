import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatAddress, formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const WalletConnection = () => {
  const { 
    isConnected, 
    isConnecting, 
    walletAddress, 
    chainId, 
    user, 
    balance, 
    tokenInfo,
    isAuthenticated,
    connectWallet, 
    disconnectWallet,
    refreshBalance,
    refreshUser
  } = useWeb3();

  const [showFullAddress, setShowFullAddress] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getChainName = (chainId: number) => {
    switch (chainId) {
      case 1: return 'Ethereum';
      case 137: return 'Polygon';
      case 56: return 'BSC';
      case 1337: return 'Local';
      default: return `Chain ${chainId}`;
    }
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
      await refreshUser();
      toast.success('Balance refreshed');
    } catch (error) {
      toast.error('Failed to refresh balance');
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast.success('Address copied to clipboard');
    }
  };

  if (!isConnected) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div>
            <h3 className="text-terminal-green mb-2">Connect Wallet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Connect your Web3 wallet to access The Backdoor marketplace
            </p>
          </div>
          
          <Button 
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full bg-terminal-green text-background hover:bg-terminal-green/80"
          >
            {isConnecting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
                Connecting...
              </div>
            ) : (
              'Connect MetaMask'
            )}
          </Button>
          
          <div className="text-xs text-muted-foreground">
            <p>Supported wallets:</p>
            <div className="flex justify-center gap-2 mt-1">
              <span>MetaMask</span>
              <span>•</span>
              <span>WalletConnect</span>
              <span>•</span>
              <span>Coinbase</span>
            </div>
          </div>
          
          <div className="border border-terminal-amber/30 bg-terminal-amber/10 p-3 rounded">
            <div className="text-xs text-terminal-amber mb-1">🔥 Deflationary Token Economy</div>
            <div className="text-xs text-muted-foreground">
              Every transaction burns tokens on The Backdoor
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        {/* Wallet Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-terminal-green rounded-full animate-pulse-slow"></div>
            <span className="text-terminal-green text-sm">
              {isAuthenticated ? 'AUTHENTICATED' : 'CONNECTED'}
            </span>
          </div>
          <Button 
            onClick={disconnectWallet}
            variant="outline"
            size="sm"
            className="text-xs border-terminal-red text-terminal-red hover:bg-terminal-red/10"
          >
            Disconnect
          </Button>
        </div>

        {/* User Info */}
        {user && isAuthenticated ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-lg">🎭</div>
              <div>
                <div className="text-sm font-medium text-foreground">{user.anonymousId}</div>
                <div className="text-xs text-muted-foreground">Anonymous Bidder</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Member Since:</span>
              <span className="text-xs text-foreground">
                {new Date(user.profile.memberSince).toLocaleDateString()}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Reputation:</span>
              <div className="flex items-center gap-1">
                <span className="text-terminal-green">★★★★☆</span>
                <span className="text-xs">({user.profile.reputation.toFixed(1)})</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Success Rate:</span>
              <span className="text-terminal-green">{user.profile.successRate}%</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Trust Me Bros:</span>
              <span className="text-terminal-amber">{user.profile.trustMeBros}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Auctions Won:</span>
              <span className="text-terminal-amber">{user.profile.wonAuctions}</span>
            </div>
          </div>
        ) : (
          <div className="text-center p-3 border border-terminal-amber/30 bg-terminal-amber/10 rounded">
            <div className="text-xs text-terminal-amber">
              Wallet connected but not authenticated with backend
            </div>
          </div>
        )}

        {/* Wallet Details */}
        <div className="space-y-2 border-t border-panel-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Address:</span>
            <button 
              onClick={copyAddress}
              className="text-xs text-foreground hover:text-terminal-green transition-colors font-mono"
            >
              {walletAddress && formatAddress(walletAddress)}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Network:</span>
            <Badge variant="outline" className="text-xs">
              {chainId && getChainName(chainId)}
            </Badge>
          </div>
        </div>

        {/* Token Balance */}
        <div className="space-y-2 border-t border-panel-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">WKC Balance:</span>
            <div className="flex items-center gap-2">
              <span className="text-terminal-green font-bold">
                {formatTokenAmount(balance)} WKC
              </span>
              <button 
                onClick={handleRefreshBalance}
                disabled={isRefreshing}
                className="text-xs text-muted-foreground hover:text-terminal-green transition-colors"
              >
                {isRefreshing ? '⟳' : '↻'}
              </button>
            </div>
          </div>
          
          {/* Balance Breakdown */}
          {user?.balance && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available:</span>
                <span className="text-terminal-green">{formatTokenAmount(user.balance.available.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locked:</span>
                <span className="text-terminal-amber">{formatTokenAmount(user.balance.locked.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="text-foreground">{formatTokenAmount(user.balance.total.toString())}</span>
              </div>
            </div>
          )}
          
          {tokenInfo && (
            <div className="text-xs text-muted-foreground space-y-1 border-t border-panel-border pt-2">
              <div className="flex justify-between">
                <span>Total Supply:</span>
                <span>{formatTokenAmount(tokenInfo.totalSupply)}</span>
              </div>
              <div className="flex justify-between">
                <span>Burned:</span>
                <span className="text-terminal-red">{formatTokenAmount(tokenInfo.totalBurned)}</span>
              </div>
              <div className="flex justify-between">
                <span>Burn Rate:</span>
                <span className="text-terminal-amber">{tokenInfo.burnRate.toFixed(2)}%</span>
              </div>
              
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Deflationary Progress</span>
                  <span className="text-terminal-red">{tokenInfo.burnRate.toFixed(2)}%</span>
                </div>
                <Progress value={tokenInfo.burnRate} className="h-1" />
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {isAuthenticated && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button 
              size="sm" 
              className="text-xs bg-terminal-green text-background hover:bg-terminal-green/80"
            >
              Buy WKC
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs border-panel-border hover:bg-accent"
            >
              View Txns
            </Button>
          </div>
        )}
        
        {/* Burn Info */}
        <div className="border border-terminal-red/30 bg-terminal-red/10 p-2 rounded">
          <div className="text-xs text-terminal-red mb-1">🔥 Auto-Burn Active</div>
          <div className="text-xs text-muted-foreground">
            3% fee on wins: 1.5% burned, 1.5% to treasury
          </div>
        </div>
      </div>
    </Card>
  );
};