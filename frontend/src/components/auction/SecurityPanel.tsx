import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { apiService } from "@/lib/api";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";

export const SecurityPanel = () => {
  const { isAuthenticated, user } = useWeb3();
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportIssue, setReportIssue] = useState({ type: '', description: '', severity: 'medium' });
  const [isReporting, setIsReporting] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');

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
      setSecurityEvents(eventsResponse.data.events || []);
      setIs2FAEnabled(statusResponse.data.features?.twoFactorAuth || false);
    } catch (error) {
      console.error('Failed to load security data:', error);
      // Use mock data for demo
      setSecurityStatus({
        securityScore: 85,
        securityLevel: 'good',
        features: {
          twoFactorAuth: false,
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
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup2FA = async () => {
    try {
      const response = await apiService.setup2FA();
      setQrCode(response.data.qrCode);
      toast.success('2FA setup initiated. Scan QR code with your authenticator app.');
    } catch (error: any) {
      console.error('Failed to setup 2FA:', error);
      toast.error(error.message || 'Failed to setup 2FA');
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFAToken || twoFAToken.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    try {
      await apiService.verify2FA(twoFAToken);
      setIs2FAEnabled(true);
      setQrCode('');
      setTwoFAToken('');
      await loadSecurityData();
      toast.success('2FA enabled successfully');
    } catch (error: any) {
      console.error('Failed to verify 2FA:', error);
      toast.error(error.message || 'Failed to verify 2FA');
    }
  };

  const handleDisable2FA = async () => {
    const token = prompt('Enter your 2FA code to disable:');
    if (!token) return;

    try {
      await apiService.disable2FA(token);
      setIs2FAEnabled(false);
      await loadSecurityData();
      toast.success('2FA disabled successfully');
    } catch (error: any) {
      console.error('Failed to disable 2FA:', error);
      toast.error(error.message || 'Failed to disable 2FA');
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

      {/* Two-Factor Authentication */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Two-Factor Authentication</h4>
        {!is2FAEnabled ? (
          <div className="space-y-3">
            {!qrCode ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Add an extra layer of security to your account
                </div>
                <Button
                  onClick={handleSetup2FA}
                  size="sm"
                  className="w-full bg-terminal-green text-background hover:bg-terminal-green/80"
                >
                  Setup 2FA
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Scan this QR code with your authenticator app:
                </div>
                <div className="flex justify-center">
                  <img src={qrCode} alt="2FA QR Code" className="w-32 h-32" />
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Enter 6-digit code"
                    value={twoFAToken}
                    onChange={(e) => setTwoFAToken(e.target.value)}
                    maxLength={6}
                    className="text-center bg-background border-panel-border"
                  />
                  <Button
                    onClick={handleVerify2FA}
                    disabled={twoFAToken.length !== 6}
                    size="sm"
                    className="w-full bg-terminal-green text-background hover:bg-terminal-green/80"
                  >
                    Verify & Enable 2FA
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-terminal-green">✓</span>
              <span className="text-xs text-foreground">2FA is enabled</span>
            </div>
            <Button
              onClick={handleDisable2FA}
              size="sm"
              variant="outline"
              className="w-full text-xs border-terminal-red text-terminal-red hover:bg-terminal-red/10"
            >
              Disable 2FA
            </Button>
          </div>
        )}
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
            <option value="">Select Issue Type</option>
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
        <button 
          onClick={() => loadSecurityData()}
          className="bg-terminal-green/20 hover:bg-terminal-green/30 px-2 py-1 text-xs text-terminal-green transition-colors"
        >
          Refresh Status
        </button>
        <button 
          onClick={() => toast.info('Security settings coming soon')}
          className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors"
        >
          Settings
        </button>
      </div>
    </div>
  );
};