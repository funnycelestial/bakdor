import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWeb3 } from '@/contexts/Web3Context';
import { WalletConnection } from '../web3/WalletConnection';
import { LiveBurnTracker } from '../web3/LiveBurnTracker';
import { RealTimeNotifications } from '../web3/RealTimeNotifications';
import { SecurityPanel } from '../auction/SecurityPanel';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const { isAuthenticated } = useWeb3();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-72 sm:w-80 bg-background border-r border-panel-border z-50 transform transition-transform duration-300 ease-in-out
        lg:relative lg:transform-none lg:w-80
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-3 sm:p-4 h-full overflow-y-auto">
          {/* Close Button (Mobile) */}
          <div className="flex justify-between items-center mb-4 lg:hidden">
            <h2 className="text-terminal-green font-medium">Menu</h2>
            <Button
              onClick={onToggle}
              variant="outline"
              size="sm"
              className="border-panel-border"
            >
              ✕
            </Button>
          </div>

          <div className="space-y-4">
            {/* Wallet Connection */}
            <WalletConnection />
            
            {/* Live Burn Tracker */}
            <LiveBurnTracker />
            
            {/* Notifications */}
            {isAuthenticated && (
              <Card className="border-panel-border bg-card/50 p-4">
                <RealTimeNotifications />
              </Card>
            )}
            
            {/* Security Panel */}
            {isAuthenticated && (
              <Card className="border-panel-border bg-card/50 p-4">
                <SecurityPanel />
              </Card>
            )}

            {/* Quick Stats */}
            <Card className="border-panel-border bg-card/50 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-terminal-green">Market Overview</h3>
                  <Badge variant="outline" className="text-terminal-green border-terminal-green">
                    LIVE
                  </Badge>
                </div>
                
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Auctions:</span>
                    <span className="text-terminal-green">47</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bidders:</span>
                    <span className="text-terminal-green">1,234</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tokens in Play:</span>
                    <span className="text-terminal-amber">45,678 WKC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Success Rate:</span>
                    <span className="text-terminal-green">73%</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </aside>
    </>
  );
};