import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AuctionDetails as AuctionDetailsComponent } from '@/components/auction/AuctionDetails';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiService, Auction } from '@/lib/api';
import { toast } from 'sonner';

const AuctionDetails = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (auctionId) {
      loadAuction();
    }
  }, [auctionId]);

  const loadAuction = async () => {
    if (!auctionId) return;

    try {
      const response = await apiService.getAuction(auctionId);
      setAuction(response.data.auction);
    } catch (error: any) {
      console.error('Failed to load auction:', error);
      toast.error(error.message || 'Failed to load auction');
      navigate('/marketplace');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <Card className="border-panel-border bg-card/50 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-secondary/20 rounded"></div>
            <div className="h-64 bg-secondary/20 rounded"></div>
          </div>
        </Card>
      </Layout>
    );
  }

  if (!auction) {
    return (
      <Layout>
        <Card className="border-panel-border bg-card/50 p-8">
          <div className="text-center space-y-4">
            <div className="text-terminal-red text-4xl">❌</div>
            <h2 className="text-xl font-bold text-foreground">Auction Not Found</h2>
            <p className="text-muted-foreground">
              The auction you're looking for doesn't exist or has been removed.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => navigate('/marketplace')}>
                Browse Marketplace
              </Button>
              <Button onClick={() => navigate('/')} variant="outline">
                Go Home
              </Button>
            </div>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <AuctionDetailsComponent 
        auctionId={auctionId!} 
        onClose={() => navigate('/marketplace')} 
      />
    </Layout>
  );
};

export default AuctionDetails;