@@ .. @@
 import { useState } from 'react';
+import { useNavigate } from 'react-router-dom';
 import { Card } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
@@ .. @@
 export const CreateAuction = () => {
   const { isAuthenticated, user, connectWallet, isConnecting } = useWeb3();
+  const navigate = useNavigate();
   const [isCreating, setIsCreating] = useState(false);
@@ .. @@
       const response = await apiService.createAuction(payload);

       toast.success('Auction created successfully!', {
         description: `Auction ID: ${response.auctionId || response.data?.auctionId}`
       });

+      // Navigate to the auction details page
+      const auctionId = response.auctionId || response.data?.auctionId;
+      if (auctionId) {
+        navigate(`/auction/${auctionId}`);
+      } else {
+        // Fallback to user dashboard
+        navigate(`/${user?.anonymousId}`);
+      }
+
       // Reset form
       setAuctionData({
@@ .. @@