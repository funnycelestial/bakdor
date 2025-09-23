import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWeb3 } from '@/contexts/Web3Context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isConnecting, isAuthenticating, user, connectWallet, authError } = useWeb3();
  const { anonymousId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // If user is authenticated but accessing wrong user route, redirect to correct one
    if (isAuthenticated && user && anonymousId && anonymousId !== user.anonymousId) {
      navigate(`/${user.anonymousId}`, { replace: true });
    }
  }, [isAuthenticated, user, anonymousId, navigate]);

  // Show loading state while connecting or authenticating
  if (isConnecting || isAuthenticating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="border-panel-border bg-card/50 p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-terminal-green border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-terminal-green text-lg font-medium">
              {isConnecting ? 'Connecting Wallet...' : 'Authenticating...'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isConnecting 
                ? 'Please approve the connection in your wallet'
                : 'Please sign the message to authenticate'
              }
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Show authentication required screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="border-panel-border bg-card/50 p-8 max-w-md w-full">
          <div className="text-center space-y-6">
            <div className="text-terminal-amber text-4xl">🔐</div>
            <div>
              <h2 className="text-terminal-green text-xl font-bold mb-2">
                Authentication Required
              </h2>
              <p className="text-muted-foreground text-sm">
                Connect and authenticate your wallet to access The Backdoor
              </p>
            </div>

            {authError && (
              <Alert className="border-terminal-red/50 bg-terminal-red/10">
                <AlertDescription className="text-terminal-red text-xs">
                  {authError}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
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
                  'Connect Wallet'
                )}
              </Button>

              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full border-panel-border"
              >
                Back to Home
              </Button>
            </div>

            <div className="border border-terminal-amber/30 bg-terminal-amber/10 p-3 rounded">
              <div className="text-xs text-terminal-amber mb-1">🎭 Anonymous Access</div>
              <div className="text-xs text-muted-foreground">
                Your identity remains anonymous. Only your wallet signature is used for authentication.
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // If authenticated but wrong user route, show loading while redirecting
  if (user && anonymousId && anonymousId !== user.anonymousId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="border-panel-border bg-card/50 p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-terminal-amber border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-terminal-amber text-sm">Redirecting to your dashboard...</p>
          </div>
        </Card>
      </div>
    );
  }

  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;