@@ .. @@
 import { useState } from 'react';
+import { useNavigate } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { useWeb3 } from '@/contexts/Web3Context';
 import { formatTokenAmount } from '@/utils/formatters';

 export const Header = () => {
   const { isAuthenticated, user, balance, tokenInfo, connectWallet, disconnectWallet } = useWeb3();
+  const navigate = useNavigate();
   const [showMobileMenu, setShowMobileMenu] = useState(false);

@@ .. @@
         {/* Logo and Status */}
         <div className="flex items-center gap-3">
-          <div className="text-lg lg:text-xl font-bold text-foreground">
+          <button 
+            onClick={() => navigate('/')}
+            className="text-lg lg:text-xl font-bold text-foreground hover:text-terminal-green transition-colors"
+          >
             █ THE BACKDOOR █
-          </div>
+          </button>
           <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-live-pulse rounded-full animate-pulse-slow"></div>
             <span className="text-xs text-terminal-green animate-pulse-slow">LIVE</span>
@@ .. @@
           {/* Desktop Navigation */}
           <nav className="hidden lg:flex gap-4 text-sm">
-            <span className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors">
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
+            >
+              Marketplace
+            </button>
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors"
+            >
               Live
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
+            </button>
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
+            >
               Ending Soon
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
+            </button>
+            {isAuthenticated && (
+              <>
+                <button 
+                  onClick={() => navigate(`/${user?.anonymousId}/bids`)}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
+                >
+                  My Bids
+                </button>
+                <button 
+                  onClick={() => navigate(`/${user?.anonymousId}/auctions`)}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
+                >
+                  My Auctions
+                </button>
+                <button 
+                  onClick={() => navigate(`/${user?.anonymousId}/watchlist`)}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
+                >
+                  Watchlist
+                </button>
+              </>
+            )}
+          </nav>
+
+          {/* User Info and Wallet */}
+          <div className="flex items-center gap-3">
+            {isAuthenticated ? (
+              <>
+                <button
+                  onClick={() => navigate(`/${user?.anonymousId}/profile`)}
+                  className="text-sm text-terminal-green hover:text-terminal-green/80 transition-colors"
+                >
+                  {user?.anonymousId} • {user?.profile.reputation.toFixed(1)}★
+                </button>
+                <button
+                  onClick={() => navigate(`/${user?.anonymousId}`)}
+                  className="text-xs"
+                >
+                  <Badge className="bg-terminal-green/20 text-terminal-green hover:bg-terminal-green/30 transition-colors">
+                    {formatTokenAmount(balance)} WKC
+                  </Badge>
+                </button>
+                <Button
+                  onClick={disconnectWallet}
+                  variant="outline"
+                  size="sm"
+                  className="text-xs border-terminal-red text-terminal-red hover:bg-terminal-red/10"
+                >
+                  Disconnect
+                </Button>
+              </>
+            ) : (
+              <Button
+                onClick={connectWallet}
+                className="bg-terminal-green text-background hover:bg-terminal-green/80"
+              >
+                Connect Wallet
+              </Button>
+            )}
+
+            {/* Mobile Menu Toggle */}
+            <button
+              onClick={() => setShowMobileMenu(!showMobileMenu)}
+              className="lg:hidden p-2 border border-panel-border bg-secondary/20 hover:bg-secondary/30 transition-colors"
+            >
+              <div className="w-4 h-4 flex flex-col justify-between">
+                <div className="w-full h-0.5 bg-foreground"></div>
+                <div className="w-full h-0.5 bg-foreground"></div>
+                <div className="w-full h-0.5 bg-foreground"></div>
+              </div>
+            </button>
+          </div>
+        </div>
+      </div>
+
+      {/* Mobile Navigation */}
+      {showMobileMenu && (
+        <nav className="lg:hidden mt-4 pt-4 border-t border-panel-border">
+          <div className="grid grid-cols-2 gap-2 text-sm">
+            <button 
+              onClick={() => {
+                navigate('/marketplace');
+                setShowMobileMenu(false);
+              }}
+              className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors p-2"
+            >
+              Marketplace
+            </button>
+            <button 
+              onClick={() => {
+                navigate('/marketplace');
+                setShowMobileMenu(false);
+              }}
+              className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2"
+            >
+              Live Auctions
+            </button>
+            {isAuthenticated ? (
+              <>
+                <button 
+                  onClick={() => {
+                    navigate(`/${user?.anonymousId}/bids`);
+                    setShowMobileMenu(false);
+                  }}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2"
+                >
+                  My Bids
+                </button>
+                <button 
+                  onClick={() => {
+                    navigate(`/${user?.anonymousId}/auctions`);
+                    setShowMobileMenu(false);
+                  }}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2"
+                >
+                  My Auctions
+                </button>
+                <button 
+                  onClick={() => {
+                    navigate(`/${user?.anonymousId}/watchlist`);
+                    setShowMobileMenu(false);
+                  }}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2"
+                >
+                  Watchlist
+                </button>
+                <button 
+                  onClick={() => {
+                    navigate(`/${user?.anonymousId}/profile`);
+                    setShowMobileMenu(false);
+                  }}
+                  className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2"
+                >
+                  Profile
+                </button>
+              </>
+            ) : (
+              <button 
+                onClick={() => {
+                  connectWallet();
+                  setShowMobileMenu(false);
+                }}
+                className="text-terminal-green hover:text-terminal-green/80 cursor-pointer transition-colors p-2 col-span-2"
+              >
+                Connect Wallet
+              </button>
+            )}
+          </div>
+        </nav>
+      )}
+    </header>
+  );
+};
+              Bids
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
-              Won
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
-              Watchlist
-            </span>
-          </nav>
-
-          {/* User Info and Wallet */}
-          <div className="flex items-center gap-3">
-            {isAuthenticated ? (
-              <>
-                <div className="text-sm text-terminal-green">
-                  {user?.anonymousId} • {user?.profile.reputation.toFixed(1)}★
-                </div>
-                <Badge className="bg-terminal-green/20 text-terminal-green">
-                  {formatTokenAmount(balance)} WKC
-                </Badge>
-                <Button
-                  onClick={disconnectWallet}
-                  variant="outline"
-                  size="sm"
-                  className="text-xs border-terminal-red text-terminal-red hover:bg-terminal-red/10"
-                >
-                  Disconnect
-                </Button>
-              </>
-            ) : (
-              <Button
-                onClick={connectWallet}
-                className="bg-terminal-green text-background hover:bg-terminal-green/80"
-              >
-                Connect Wallet
-              </Button>
-            )}
-
-            {/* Mobile Menu Toggle */}
-            <button
-              onClick={() => setShowMobileMenu(!showMobileMenu)}
-              className="lg:hidden p-2 border border-panel-border bg-secondary/20 hover:bg-secondary/30 transition-colors"
-            >
-              <div className="w-4 h-4 flex flex-col justify-between">
-                <div className="w-full h-0.5 bg-foreground"></div>
-                <div className="w-full h-0.5 bg-foreground"></div>
-                <div className="w-full h-0.5 bg-foreground"></div>
-              </div>
-            </button>
-          </div>
-        </div>
-      </div>
-
-      {/* Mobile Navigation */}
-      {showMobileMenu && (
-        <nav className="lg:hidden mt-4 pt-4 border-t border-panel-border">
-          <div className="grid grid-cols-2 gap-2 text-sm">
-            <span className="text-terminal-amber hover:text-terminal-amber/80 cursor-pointer transition-colors p-2">
-              Live
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
-              Ending Soon
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
-              Bids
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
-              Won
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
-              Watchlist
-            </span>
-            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-2">
-              Analytics
-            </span>
-          </div>
-        </nav>
-      )}
-    </header>
-  );
-};