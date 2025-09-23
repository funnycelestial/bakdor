import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '@/contexts/Web3Context';
import { Layout } from '@/components/layout/Layout';
import { CreateAuction as CreateAuctionComponent } from '@/components/auction/CreateAuction';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const CreateAuction = () => {
  const { anonymousId } = useParams();
  const { user } = useWeb3();
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <Card className="border-panel-border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => navigate(`/${user?.anonymousId || ''}`)}
                variant="outline"
                size="sm"
                className="border-panel-border"
              >
                ← Back to Dashboard
              </Button>
              <div>
                <h1 className="text-xl font-bold text-terminal-green">Create New Auction</h1>
                <p className="text-sm text-muted-foreground">
                  List your item on The Backdoor marketplace
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-muted-foreground">Seller</div>
              <div className="text-terminal-green">{user?.anonymousId}</div>
            </div>
          </div>
        </Card>

        {/* Create Auction Form */}
        <CreateAuctionComponent />
      </div>
    </Layout>
  );
};

export default CreateAuction;