import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useWeb3 } from '@/contexts/Web3Context';
import { Layout } from '@/components/layout/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SecurityPanel } from '@/components/auction/SecurityPanel';
import { BidHistory } from '@/components/auction/BidHistory';
import { MyAuctions } from '@/components/auction/MyAuctions';
import { formatTokenAmount } from '@/utils/formatters';

const UserProfile = () => {
  const { anonymousId } = useParams();
  const { user, balance, refreshUser } = useWeb3();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshProfile = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!user) {
    return null; // ProtectedRoute will handle this
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Profile Header */}
        <Card className="border-panel-border bg-card/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => navigate(`/${user.anonymousId}`)}
                variant="outline"
                size="sm"
                className="border-panel-border"
              >
                ← Back to Dashboard
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-terminal-green/20 rounded-full flex items-center justify-center">
                  <span className="text-terminal-green text-2xl">🎭</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-terminal-green">{user.anonymousId}</h1>
                  <p className="text-muted-foreground">Anonymous Auction Participant</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-terminal-green">★★★★☆</span>
                    <span className="text-xs text-muted-foreground">
                      ({user.profile.reputation.toFixed(1)}) • Member since {new Date(user.profile.memberSince).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={handleRefreshProfile}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="border-panel-border"
            >
              {isRefreshing ? '⟳' : '↻'} Refresh
            </Button>
          </div>

          {/* Profile Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-panel-border bg-secondary/20 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-terminal-green">
                  {formatTokenAmount(balance)}
                </div>
                <div className="text-sm text-muted-foreground">WKC Balance</div>
              </div>
            </Card>
            
            <Card className="border-panel-border bg-secondary/20 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-terminal-amber">
                  {user.profile.totalAuctions}
                </div>
                <div className="text-sm text-muted-foreground">Total Auctions</div>
              </div>
            </Card>
            
            <Card className="border-panel-border bg-secondary/20 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">
                  {user.profile.wonAuctions}
                </div>
                <div className="text-sm text-muted-foreground">Auctions Won</div>
              </div>
            </Card>
            
            <Card className="border-panel-border bg-secondary/20 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-terminal-red">
                  {user.profile.successRate}%
                </div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </div>
            </Card>
          </div>

          {/* Performance Metrics */}
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-medium text-foreground">Performance Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reputation Score</span>
                  <span className="text-terminal-green">{user.profile.reputation.toFixed(1)}/5.0</span>
                </div>
                <Progress value={(user.profile.reputation / 5) * 100} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="text-terminal-amber">{user.profile.successRate}%</span>
                </div>
                <Progress value={user.profile.successRate} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trust Me Bros</span>
                  <span className="text-terminal-red">{user.profile.trustMeBros}</span>
                </div>
                <Progress value={Math.min(100, (user.profile.trustMeBros / 100) * 100)} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Account Status</span>
                  <Badge className="bg-terminal-green/20 text-terminal-green">
                    {user.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Profile Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="auctions">My Auctions</TabsTrigger>
            <TabsTrigger value="bids">Bid History</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-panel-border bg-card/50 p-4">
                <h3 className="text-terminal-green mb-4">Account Overview</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Anonymous ID:</span>
                    <span className="text-foreground font-mono">{user.anonymousId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Wallet Address:</span>
                    <span className="text-foreground font-mono">
                      {user.walletAddress.slice(0, 10)}...{user.walletAddress.slice(-6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member Since:</span>
                    <span className="text-foreground">
                      {new Date(user.profile.memberSince).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verification Status:</span>
                    <Badge className={user.profile.isVerified ? 'bg-terminal-green/20 text-terminal-green' : 'bg-terminal-amber/20 text-terminal-amber'}>
                      {user.profile.isVerified ? 'VERIFIED' : 'UNVERIFIED'}
                    </Badge>
                  </div>
                </div>
              </Card>

              <Card className="border-panel-border bg-card/50 p-4">
                <h3 className="text-terminal-green mb-4">Balance Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Balance:</span>
                    <span className="text-terminal-green font-bold">
                      {formatTokenAmount(user.balance.total.toString())} WKC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Available:</span>
                    <span className="text-foreground">
                      {formatTokenAmount(user.balance.available.toString())} WKC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Locked in Bids:</span>
                    <span className="text-terminal-amber">
                      {formatTokenAmount(user.balance.locked.toString())} WKC
                    </span>
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-xs">
                      <span>Balance Utilization</span>
                      <span>{((user.balance.locked / user.balance.total) * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(user.balance.locked / user.balance.total) * 100} className="h-2" />
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="auctions">
            <MyAuctions />
          </TabsContent>

          <TabsContent value="bids">
            <BidHistory />
          </TabsContent>

          <TabsContent value="security">
            <SecurityPanel />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default UserProfile;