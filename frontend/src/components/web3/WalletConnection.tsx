import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatAddress, formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const WalletConnection = () => {
  const { 
    isConnected, 
    isConnecting, 
    isAuthenticating,
    walletAddress, 
    chainId, 
    walletType,
    user, 
    balance, 
    tokenInfo,
    isAuthenticated,
    authError,
    connectWallet, 
    disconnectWallet,
    refreshBalance,
    refreshUser,
    clearAuthError
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

  const getSupportedWallets = () => [
    { name: 'MetaMask', detected: window.ethereum?.isMetaMask },
    { name: 'Coinbase Wallet', detected: window.ethereum?.isCoinbaseWallet },
    { name: 'Binance Wallet', detected: window.ethereum?.isBinance },
    { name: 'WalletConnect', detected: window.ethereum?.isWalletConnect }
  ];
  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
      await refreshUser();
      toast.success('Balance refreshed from blockchain');
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

  const handleConnectWallet = async () => {
    clearAuthError();
    await connectWallet();
  };
  if (!isConnected) {
    return (
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="text-center space-y-4">
          <div className="text-terminal-amber text-lg">🔐</div>
          <div>
            <h3 className="text-terminal-green mb-2">Connect to The Backdoor</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Connect your Web3 wallet to access the anonymous auction marketplace
            </p>
          </div>
          
          {authError && (
            <Alert className="border-terminal-red/50 bg-terminal-red/10">
              <AlertDescription className="text-terminal-red text-xs">
                {authError}
              </AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="w-full bg-terminal-green text-background hover:bg-terminal-green/80"
          >
            {isConnecting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
                {isAuthenticating ? 'Authenticating...' : 'Connecting...'}
              </div>
            ) : (
              'Connect Wallet'
            )}
          </Button>
          
          <div className="text-xs text-muted-foreground">
            <p>Supported wallets:</p>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {getSupportedWallets().map((wallet) => (
                <div key={wallet.name} className={`text-xs ${wallet.detected ? 'text-terminal-green' : 'text-muted-foreground'}`}>
                  {wallet.detected ? '✓' : '○'} {wallet.name}
                </div>
              ))}
            </div>
          </div>
          
          <div className="border border-terminal-amber/30 bg-terminal-amber/10 p-3 rounded">
            <div className="text-xs text-terminal-amber mb-1">🔥 Deflationary Token Economy</div>
            <div className="text-xs text-muted-foreground">
              Every transaction burns WKC tokens on The Backdoor
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full animate-pulse-slow ${
              isAuthenticated ? 'bg-terminal-green' : 
              isAuthenticating ? 'bg-terminal-amber' : 
              'bg-terminal-red'
            }`}></div>
            <span className="text-terminal-green text-sm">
              {isAuthenticated ? 'AUTHENTICATED' : 
               isAuthenticating ? 'AUTHENTICATING' : 
               'CONNECTED'}
            </span>
            {walletType && (
              <Badge variant="outline" className="text-xs">
                {walletType}
              </Badge>
            )}
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

        {/* Authentication Status */}
        {!isAuthenticated && isConnected && !isAuthenticating && (
          <Alert className="border-terminal-amber/50 bg-terminal-amber/10">
            <AlertDescription className="text-terminal-amber text-xs">
              <div className="flex items-center justify-between">
                <span>Authentication required to access features</span>
                <Button
                  onClick={handleConnectWallet}
                  size="sm"
                  className="bg-terminal-amber text-background hover:bg-terminal-amber/80"
                >
                  Authenticate
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {isAuthenticating && (
          <Alert className="border-terminal-amber/50 bg-terminal-amber/10">
            <AlertDescription className="text-terminal-amber text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-terminal-amber border-t-transparent rounded-full animate-spin"></div>
                Authenticating with The Backdoor...
              </div>
            </AlertDescription>
          </Alert>
        )}

        {authError && !isAuthenticating && (
          <Alert className="border-terminal-red/50 bg-terminal-red/10">
            <AlertDescription className="text-terminal-red text-xs">
              <div className="flex items-center justify-between">
                <span>{authError}</span>
                <Button
                  onClick={handleConnectWallet}
                  size="sm"
                  className="bg-terminal-red text-background hover:bg-terminal-red/80"
                >
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* User Info */}
        {user && isAuthenticated ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-lg">🎭</div>
              <div>
                <div className="text-sm font-medium text-foreground">{user.anonymousId}</div>
                <div className="text-xs text-muted-foreground">Anonymous Bidder</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member Since:</span>
                <span className="text-foreground">
                  {new Date(user.profile.memberSince).toLocaleDateString()}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reputation:</span>
                <div className="flex items-center gap-1">
                  <span className="text-terminal-green">★★★★☆</span>
                  <span className="text-xs">({user.profile.reputation.toFixed(1)})</span>
                </div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Success Rate:</span>
                <span className="text-terminal-green">{user.profile.successRate}%</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trust Me Bros:</span>
                <span className="text-terminal-amber">{user.profile.trustMeBros}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Auctions:</span>
                <span className="text-foreground">{user.profile.totalAuctions}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auctions Won:</span>
                <span className="text-terminal-amber">{user.profile.wonAuctions}</span>
              </div>
            </div>
          </div>
        ) : null}

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
        {isAuthenticated && (
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
                <span className="text-muted-foreground">Locked in Bids:</span>
                <span className="text-terminal-amber">{formatTokenAmount(user.balance.locked.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="text-foreground">{formatTokenAmount(user.balance.total.toString())}</span>
              </div>
              
              {/* Balance Usage Visualization */}
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Balance Usage</span>
                  <span>{((user.balance.locked / user.balance.total) * 100).toFixed(1)}% locked</span>
                </div>
                <Progress value={(user.balance.locked / user.balance.total) * 100} className="h-1" />
              </div>
            </div>
          )}
          
          {/* Token Info */}
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
        )}

        {/* Quick Actions */}
        {isAuthenticated && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button 
              size="sm" 
              className="text-xs bg-terminal-green text-background hover:bg-terminal-green/80"
              onClick={() => toast.info('Token purchase coming soon')}
            >
              Buy WKC
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs border-panel-border hover:bg-accent"
              onClick={() => toast.info('Transaction history coming soon')}
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