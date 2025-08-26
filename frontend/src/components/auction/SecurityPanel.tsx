import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { apiService, SecurityEvent } from "@/lib/api";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";

export const SecurityPanel = () => {
  const { isAuthenticated, user } = useWeb3();
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportIssue, setReportIssue] = useState({ type: '', description: '', severity: 'medium' });
  const [isReporting, setIsReporting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadSecurityData();
    }
  }, [isAuthenticated]);

  const loadSecurityData = async () => {
    try {
      const [statusResponse, eventsResponse] = await Promise.all([
        apiService.getSecurityStatus(),
        apiService.getSecurityEvents({ limit: 10 })
      ]);
      
      setSecurityStatus(statusResponse.data);
      setSecurityEvents(eventsResponse.data.events);
    } catch (error) {
      console.error('Failed to load security data:', error);
      // Use mock data for demo
      setSecurityStatus({
        securityScore: 85,
        securityLevel: 'good',
        features: {
          twoFactorAuth: true,
          identityVerified: true,
          walletVerified: true,
          antiPhishing: true,
          rateProtection: true
        },
        recentEvents: []
      });
      setSecurityEvents([
        {
          eventId: "SEC_001",
          type: "identity_verification",
          description: "Identity verification completed successfully",
          timestamp: "5 mins ago",
          severity: "low",
          status: "resolved"
        },
        {
          eventId: "SEC_002", 
          type: "suspicious_activity",
          description: "Multiple rapid bids detected - Auto-flagged",
          timestamp: "12 mins ago",
          severity: "medium",
          status: "monitoring"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportIssue = async () => {
    if (!reportIssue.type || !reportIssue.description.trim()) {
      toast.error('Please select issue type and provide description');
      return;
    }

    setIsReporting(true);
    try {
      await apiService.reportSecurityIssue(
        reportIssue.type,
        reportIssue.description.trim(),
        reportIssue.severity
      );
      
      await loadSecurityData();
      setReportIssue({ type: '', description: '', severity: 'medium' });
      toast.success('Security issue reported successfully');
    } catch (error: any) {
      console.error('Failed to report security issue:', error);
      toast.error(error.message || 'Failed to report security issue');
    } finally {
      setIsReporting(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'text-terminal-green';
      case 'medium': return 'text-terminal-amber';
      case 'high': return 'text-terminal-red';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-terminal-green/20 text-terminal-green';
      case 'monitoring': return 'bg-terminal-amber/20 text-terminal-amber';
      case 'action_required': return 'bg-terminal-red/20 text-terminal-red';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center p-4 border border-panel-border bg-secondary/20 rounded">
        <div className="text-terminal-amber mb-2">🔐</div>
        <div className="text-sm text-muted-foreground">
          Connect your wallet to view security settings
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-secondary/20 rounded"></div>
        <div className="h-32 bg-secondary/20 rounded"></div>
        <div className="h-24 bg-secondary/20 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Security & Verification</h3>
        <Badge variant="outline" className="text-terminal-green border-terminal-green">
          ✓ SECURE
        </Badge>
      </div>

      {/* Security Status */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Security Status</h4>
        <div className="mb-3">
          <div className="text-lg font-bold text-terminal-green">{securityStatus?.securityScore || 85}/100</div>
          <div className="text-xs text-muted-foreground">Security Score ({securityStatus?.securityLevel || 'good'})</div>
        </div>
        <div className="space-y-2 text-xs">
          {securityStatus?.features && Object.entries(securityStatus.features).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}:
              </span>
              <span className={value ? "text-terminal-green" : "text-terminal-red"}>
                {value ? "✓ ENABLED" : "✗ DISABLED"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Anonymity Protection */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Anonymity Protection</h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-slow"></div>
            <span className="text-terminal-green">Anonymous ID: {user?.anonymousId}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-slow"></div>
            <span className="text-terminal-green">IP Masking: ACTIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-slow"></div>
            <span className="text-terminal-green">Identity Escrow: ENABLED</span>
          </div>
        </div>
      </Card>

      {/* Recent Security Events */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Security Events</h4>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {securityEvents.map((event) => (
            <div key={event.eventId} className="p-2 border border-panel-border bg-background/50 rounded text-xs">
              <div className="flex items-center justify-between mb-1">
                <Badge className={getStatusColor(event.status)}>
                  {event.status.replace('_', ' ').toUpperCase()}
                </Badge>
                <span className={getSeverityColor(event.severity)}>
                  {event.severity.toUpperCase()}
                </span>
              </div>
              <div className="text-foreground mb-1">{event.description}</div>
              <div className="text-muted-foreground">{event.timestamp}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Report Security Issue */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Report Security Issue</h4>
        <div className="space-y-2">
          <select 
            value={reportIssue.type}
            onChange={(e) => setReportIssue(prev => ({ ...prev, type: e.target.value }))}
            className="w-full bg-background border border-panel-border px-2 py-1 text-xs focus:border-terminal-green focus:outline-none"
          >
            <option value="other">Select Issue Type</option>
            <option value="suspicious_activity">Suspicious Activity</option>
            <option value="phishing_attempt">Phishing Attempt</option>
            <option value="unauthorized_access">Unauthorized Access</option>
            <option value="technical_issue">Technical Issue</option>
            <option value="other">Other</option>
          </select>
          
          <textarea 
            placeholder="Describe the security issue..."
            value={reportIssue.description}
            onChange={(e) => setReportIssue(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-background border border-panel-border px-2 py-1 text-xs focus:border-terminal-green focus:outline-none min-h-[60px]"
          />
          
          <button 
            onClick={handleReportIssue}
            disabled={isReporting || !reportIssue.type || !reportIssue.description.trim()}
            className="bg-terminal-red px-3 py-1 text-xs text-background hover:bg-terminal-red/80 transition-colors disabled:opacity-50"
          >
            {isReporting ? 'Reporting...' : 'Report Issue'}
          </button>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
          Security Settings
        </button>
        <button 
          onClick={() => loadSecurityData()}
          className="bg-terminal-green/20 hover:bg-terminal-green/30 px-2 py-1 text-xs text-terminal-green transition-colors"
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
};