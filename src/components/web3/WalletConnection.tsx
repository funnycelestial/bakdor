@@ .. @@
 import { useState } from 'react';
+import { useNavigate } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
@@ .. @@
 export const WalletConnection = () => {
   const { 
     isConnected, 
     isConnecting, 
     isAuthenticating,
     walletAddress, 
     chainId, 
     walletType,
     user, 
     balance, 
     tokenInfo,
     isAuthenticated,
     authError,
     connectWallet, 
     disconnectWallet,
     refreshBalance,
     refreshUser,
     clearAuthError
   } = useWeb3();
+  const navigate = useNavigate();

   const [showFullAddress, setShowFullAddress] = useState(false);
@@ .. @@
         {/* User Info */}
         {user && isAuthenticated ? (
           <div className="space-y-3">
-            <div className="flex items-center gap-2 mb-2">
+            <button 
+              onClick={() => navigate(`/${user.anonymousId}/profile`)}
+              className="flex items-center gap-2 mb-2 w-full text-left hover:bg-secondary/20 p-2 rounded transition-colors"
+            >
               <div className="text-lg">🎭</div>
               <div>
                 <div className="text-sm font-medium text-foreground">{user.anonymousId}</div>
                 <div className="text-xs text-muted-foreground">Anonymous Bidder</div>
               </div>
-            </div>
+            </button>
             
             <div className="grid grid-cols-2 gap-3 text-xs">
@@ .. @@
         {/* Quick Actions */}
         {isAuthenticated && (
           <div className="grid grid-cols-2 gap-2 pt-2">
             <Button 
               size="sm" 
               className="text-xs bg-terminal-green text-background hover:bg-terminal-green/80"
-              onClick={() => toast.info('Token purchase coming soon')}
+              onClick={() => navigate(`/${user?.anonymousId}/profile`)}
             >
-              Buy WKC
+              Profile
             </Button>
             <Button 
               size="sm" 
               variant="outline" 
               className="text-xs border-panel-border hover:bg-accent"
-              onClick={() => toast.info('Transaction history coming soon')}
+              onClick={() => navigate(`/${user?.anonymousId}/create`)}
             >
-              View Txns
+              Create
             </Button>
           </div>
         )}
@@ .. @@