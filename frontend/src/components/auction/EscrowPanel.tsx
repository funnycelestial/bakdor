import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { apiService, EscrowTransaction } from "@/lib/api";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";
import { formatTokenAmount } from '@/utils/formatters';

export const EscrowPanel = () => {
  const { isAuthenticated, user } = useWeb3();
  const [escrowTransactions, setEscrowTransactions] = useState<EscrowTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadEscrowTransactions();
    }
  }, [isAuthenticated]);

  const loadEscrowTransactions = async () => {
    try {
      const response = await apiService.getEscrowTransactions({ limit: 20 });
      setEscrowTransactions(response.data.escrows);
    } catch (error) {
      console.error('Failed to load escrow transactions:', error);
      toast.error('Failed to load escrow transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelivery = async (escrowId: string) => {
    setActionLoading(escrowId);
    try {
      await apiService.confirmDelivery(escrowId, 5); // Default 5-star rating
      await loadEscrowTransactions();
      toast.success('Delivery confirmed and payment released');
    } catch (error: any) {
      console.error('Failed to confirm delivery:', error);
      toast.error(error.message || 'Failed to confirm delivery');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkDelivered = async (escrowId: string) => {
    setActionLoading(escrowId);
    try {
      await apiService.markAsDelivered(escrowId);
      await loadEscrowTransactions();
      toast.success('Item marked as delivered');
    } catch (error: any) {
      console.error('Failed to mark as delivered:', error);
      toast.error(error.message || 'Failed to mark as delivered');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDispute = async (escrowId: string) => {
    const reason = prompt('Please describe the issue:');
    if (!reason) return;

    setActionLoading(escrowId);
    try {
      await apiService.initiateDispute(escrowId, reason);
      await loadEscrowTransactions();
      toast.success('Dispute filed successfully');
    } catch (error: any) {
      console.error('Failed to file dispute:', error);
      toast.error(error.message || 'Failed to file dispute');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'funded': return 'bg-terminal-green/20 text-terminal-green';
      case 'delivered': return 'bg-blue-500/20 text-blue-400';
      case 'disputed': return 'bg-terminal-red/20 text-terminal-red';
      case 'completed': return 'bg-green-500/20 text-green-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'pending': return 25;
      case 'funded': return 50;
      case 'delivered': return 75;
      case 'completed': return 100;
      case 'disputed': return 40;
      default: return 0;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center p-4 border border-panel-border bg-secondary/20 rounded">
        <div className="text-terminal-amber mb-2">🔐</div>
        <div className="text-sm text-muted-foreground">
          Connect your wallet to view escrow transactions
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Escrow Management</h3>
        <Badge variant="outline" className="text-terminal-green border-terminal-green">
          {escrowTransactions.length} Active
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-panel-border bg-secondary/20 p-3 rounded animate-pulse">
              <div className="h-4 bg-secondary/40 rounded mb-2"></div>
              <div className="h-12 bg-secondary/40 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
        {escrowTransactions.map((transaction) => (
          <div key={transaction.id} className="border border-panel-border bg-secondary/20 p-3 rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-foreground">{transaction.auctionItem}</div>
              <Badge className={getStatusColor(transaction.status)}>
                {transaction.status.toUpperCase()}
              </Badge>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Escrow ID:</span>
                <span className="text-foreground">{transaction.escrowId}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="text-terminal-green">{transaction.amount} WKC</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer:</span>
                <span className="text-foreground">{transaction.buyer}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seller:</span>
                <span className="text-foreground">{transaction.seller}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery Deadline:</span>
                <span className="text-terminal-red">{transaction.deliveryDeadline}</span>
              </div>
              
              <div className="mt-2">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Progress:</span>
                  <span className="text-foreground">{getStatusProgress(transaction.status)}%</span>
                </div>
                <Progress value={getStatusProgress(transaction.status)} className="h-1" />
              </div>
              
              <div className="flex gap-2 mt-3">
                {transaction.status === 'delivered' && (
                  <button 
                    onClick={() => handleConfirmDelivery(transaction.escrowId)}
                    disabled={actionLoading === transaction.escrowId}
                    className="bg-terminal-green px-2 py-1 text-xs text-background hover:bg-terminal-green/80 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === transaction.escrowId ? 'Processing...' : 'Confirm Delivery'}
                  </button>
                )}
                {transaction.status === 'funded' && transaction.seller === user?.anonymousId && (
                  <button 
                    onClick={() => handleMarkDelivered(transaction.escrowId)}
                    disabled={actionLoading === transaction.escrowId}
                    className="bg-terminal-amber px-2 py-1 text-xs text-background hover:bg-terminal-amber/80 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === transaction.escrowId ? 'Processing...' : 'Mark Delivered'}
                  </button>
                )}
                <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                  View Details
                </button>
                {(transaction.status === 'funded' || transaction.status === 'delivered') && (
                  <button 
                    onClick={() => handleDispute(transaction.escrowId)}
                    disabled={actionLoading === transaction.escrowId}
                    className="bg-terminal-red/20 hover:bg-terminal-red/30 px-2 py-1 text-xs text-terminal-red transition-colors disabled:opacity-50"
                  >
                    File Dispute
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      )}

      {!isLoading && escrowTransactions.length === 0 && (
        <div className="text-center py-8">
          <div className="text-terminal-amber text-2xl mb-2">🔒</div>
          <div className="text-sm text-muted-foreground">No escrow transactions yet</div>
        </div>
      )}
    </div>
  );
};