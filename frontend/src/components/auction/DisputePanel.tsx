import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { apiService, Dispute } from "@/lib/api";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";

export const DisputePanel = () => {
  const { isAuthenticated, user } = useWeb3();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [newDispute, setNewDispute] = useState("");
  const [selectedEscrow, setSelectedEscrow] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [escrowOptions, setEscrowOptions] = useState<any[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDisputes();
      loadEscrowOptions();
    }
  }, [isAuthenticated]);

  const loadDisputes = async () => {
    try {
      const response = await apiService.getDisputes({ limit: 20 });
      setDisputes(response.data.disputes);
    } catch (error) {
      console.error('Failed to load disputes:', error);
      toast.error('Failed to load disputes');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEscrowOptions = async () => {
    try {
      const response = await apiService.getEscrowTransactions({ 
        status: 'funded',
        limit: 50 
      });
      setEscrowOptions(response.data.escrows);
    } catch (error) {
      console.error('Failed to load escrow options:', error);
    }
  };

  const handleFileDispute = async () => {
    if (!selectedEscrow || !newDispute.trim()) {
      toast.error('Please select an escrow and provide a reason');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.initiateDispute(selectedEscrow, newDispute.trim());
      await loadDisputes();
      setNewDispute("");
      setSelectedEscrow("");
      toast.success('Dispute filed successfully');
    } catch (error: any) {
      console.error('Failed to file dispute:', error);
      toast.error(error.message || 'Failed to file dispute');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespondToDispute = async (disputeId: string) => {
    const response = prompt('Enter your response:');
    if (!response) return;

    try {
      await apiService.respondToDispute(disputeId, response);
      await loadDisputes();
      toast.success('Response added to dispute');
    } catch (error: any) {
      console.error('Failed to respond to dispute:', error);
      toast.error(error.message || 'Failed to respond to dispute');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-terminal-red/20 text-terminal-red';
      case 'investigating': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'resolved': return 'bg-terminal-green/20 text-terminal-green';
      case 'closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center p-4 border border-panel-border bg-secondary/20 rounded">
        <div className="text-terminal-amber mb-2">🔐</div>
        <div className="text-sm text-muted-foreground">
          Connect your wallet to view disputes
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Dispute Management</h3>
        <Badge variant="outline" className="text-terminal-red border-terminal-red">
          {disputes.filter(d => d.status !== 'closed').length} Active
        </Badge>
      </div>

      {/* File New Dispute */}
      <div className="border border-panel-border bg-secondary/20 p-3 rounded">
        <h4 className="text-sm font-medium text-foreground mb-2">File New Dispute</h4>
        <div className="space-y-2">
          <select 
            value={selectedEscrow}
            onChange={(e) => setSelectedEscrow(e.target.value)}
            className="w-full bg-background border border-panel-border px-2 py-1 text-xs focus:border-terminal-green focus:outline-none"
          >
            <option value="none">Select Escrow Transaction</option>
            {escrowOptions.map((escrow) => (
              <option key={escrow.escrowId} value={escrow.escrowId}>
                {escrow.escrowId} - {escrow.auctionItem}
              </option>
            ))}
          </select>
          
          <Textarea 
            placeholder="Describe the issue in detail..."
            value={newDispute}
            onChange={(e) => setNewDispute(e.target.value)}
            className="text-xs min-h-[60px]"
          />
          
          <button 
            onClick={handleFileDispute}
            disabled={isSubmitting || !selectedEscrow || !newDispute.trim()}
            className="bg-terminal-red px-3 py-1 text-xs text-background hover:bg-terminal-red/80 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Filing...' : 'File Dispute'}
            File Dispute
          </button>
        </div>
      </div>

      {/* Active Disputes */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-panel-border bg-secondary/20 p-3 rounded animate-pulse">
              <div className="h-4 bg-secondary/40 rounded mb-2"></div>
              <div className="h-16 bg-secondary/40 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
        {disputes.map((dispute) => (
          <div key={dispute.disputeId} className="border border-panel-border bg-secondary/20 p-3 rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-foreground">{dispute.auctionItem}</div>
              <Badge className={getStatusColor(dispute.status)}>
                {dispute.status.toUpperCase()}
              </Badge>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dispute ID:</span>
                <span className="text-foreground">{dispute.disputeId}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Escrow:</span>
                <span className="text-foreground">{dispute.escrowId}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="text-terminal-green">{dispute.amount} WKC</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Initiator:</span>
                <span className="text-foreground">{dispute.initiator}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Respondent:</span>
                <span className="text-foreground">{dispute.respondent}</span>
              </div>
              
              {dispute.adminAssigned && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin:</span>
                  <span className="text-terminal-amber">{dispute.adminAssigned}</span>
                </div>
              )}
              
              <div className="mt-2">
                <span className="text-muted-foreground">Reason:</span>
                <p className="text-foreground mt-1 p-2 bg-background/50 rounded text-xs">
                  {dispute.reason}
                </p>
              </div>
              
              <div className="flex gap-2 mt-3">
                <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                  View Details
                </button>
                <button 
                  onClick={() => handleRespondToDispute(dispute.disputeId)}
                  className="bg-terminal-amber px-2 py-1 text-xs text-background hover:bg-terminal-amber/80 transition-colors"
                >
                  Add Response
                </button>
              </div>
            </div>
          </div>
        ))}
        </div>
      )}

      {!isLoading && disputes.length === 0 && (
        <div className="text-center py-8">
          <div className="text-terminal-green text-2xl mb-2">⚖️</div>
          <div className="text-sm text-muted-foreground">No disputes filed</div>
        </div>
      )}
    </div>
  );
};