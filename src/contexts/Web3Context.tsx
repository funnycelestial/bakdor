@@ .. @@
 import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
 import { ethers } from 'ethers';
+import { useNavigate } from 'react-router-dom';
 import { apiService, User } from '@/lib/api';
 import { formatTokenAmount } from '@/utils/formatters';
 import { toast } from 'sonner';

@@ .. @@
 export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
+  const navigate = useNavigate();
   const [isConnected, setIsConnected] = useState(false);
   const [isConnecting, setIsConnecting] = useState(false);
   const [isAuthenticating, setIsAuthenticating] = useState(false);
@@ .. @@
           await Promise.all([
             refreshBalance(),
             refreshTokenInfo()
           ]);
           
           toast.success(`Welcome back, ${authResponse.user.anonymousId}!`);
+          
+          // Redirect to user dashboard after successful authentication
+          navigate(`/${authResponse.user.anonymousId}`, { replace: true });
+          
           return authResponse.user;
         }
       } else if (nonceResponse.user) {
@@ .. @@
         await Promise.all([
           refreshBalance(),
           refreshTokenInfo()
         ]);
         
+        // Redirect to user dashboard if not already there
+        const currentPath = window.location.pathname;
+        if (currentPath === '/' || currentPath === '/marketplace') {
+          navigate(`/${nonceResponse.user.anonymousId}`, { replace: true });
+        }
+        
         return nonceResponse.user;
       }
     } catch (error) {
@@ .. @@
       // Authenticate with backend
       setIsAuthenticating(true);
-      await authenticateUser(connection.address, connection.signer);
+      const authenticatedUser = await authenticateUser(connection.address, connection.signer);
+      
+      // Redirect to user dashboard after successful authentication
+      if (authenticatedUser) {
+        const currentPath = window.location.pathname;
+        if (currentPath === '/' || currentPath === '/marketplace') {
+          navigate(`/${authenticatedUser.anonymousId}`, { replace: true });
+        }
+      }
       
     } catch (error: any) {
       console.error('Wallet connection failed:', error);
@@ .. @@
   const disconnectWallet = () => {
     apiService.clearAuthToken();
     apiService.disconnectSocket();
+    
+    // Navigate back to home page
+    navigate('/', { replace: true });
+    
     setIsConnected(false);
     setWalletAddress(null);
     setChainId(null);
@@ .. @@