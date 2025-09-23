import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '@/contexts/Web3Context';
import { Layout } from '@/components/layout/Layout';
import AuctionDashboard from '@/components/AuctionDashboard';

const UserDashboard = () => {
  const { anonymousId } = useParams();
  const { user } = useWeb3();
  const navigate = useNavigate();

  // This component is wrapped in ProtectedRoute, so user should always be authenticated
  if (!user) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* User Header */}
        <div className="border border-panel-border bg-card/50 p-4 rounded">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🎭</div>
              <div>
                <h1 className="text-xl font-bold text-terminal-green">
                  Welcome, {user.anonymousId}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your anonymous auction dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right text-xs">
                <div className="text-muted-foreground">Reputation</div>
                <div className="text-terminal-green">
                  ★★★★☆ ({user.profile.reputation.toFixed(1)})
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-muted-foreground">Success Rate</div>
                <div className="text-terminal-amber">{user.profile.successRate}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard */}
        <AuctionDashboard />
      </div>
    </Layout>
  );
};

export default UserDashboard;