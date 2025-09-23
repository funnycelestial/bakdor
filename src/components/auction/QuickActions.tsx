@@ .. @@
 import { useState } from 'react';
+import { useNavigate } from 'react-router-dom';
 import { Card } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
@@ .. @@
 export const QuickActions = () => {
   const { isAuthenticated, user, balance, refreshBalance } = useWeb3();
+  const navigate = useNavigate();
   const [isLoading, setIsLoading] = useState(false);

@@ .. @@
       action: async () => {
         try {
-          const response = await apiService.getAuctions({ 
-            status: 'active',
-            sort: 'ending_soon',
-            limit: 20 
-          });
-          
-          const endingSoon = response.data.auctions.filter(auction => {
-            const timeLeft = new Date(auction.timing.endTime).getTime() - Date.now();
-            return timeLeft <= 60 * 60 * 1000 && timeLeft > 0;
-          });
-          
-          toast.success(`Found ${endingSoon.length} auctions ending soon`);
+          navigate('/marketplace');
+          toast.success('Navigated to marketplace');
         } catch (error) {
-          toast.error('Failed to load ending soon auctions');
+          toast.error('Navigation failed');
         }
       }
@@ .. @@
       action: async () => {
         try {
-          const response = await apiService.getAuctions({ 
-            category: 'electronics',
-            sort: 'most_bids',
-            limit: 20 
-          });
-          toast.success(`Found ${response.data.auctions.length} hot electronics`);
+          navigate('/marketplace');
+          toast.success('Navigated to electronics');
         } catch (error) {
-          toast.error('Failed to load electronics');
+          toast.error('Navigation failed');
         }
       }
@@ .. @@
       action: async () => {
         try {
-          const response = await apiService.getAuctions({ 
-            status: 'active',
-            limit: 50 
-          });
-          
-          const buyNowAuctions = response.data.auctions.filter(auction => 
-            auction.pricing.buyNowPrice > 0
-          );
-          
-          toast.success(`Found ${buyNowAuctions.length} buy now auctions`);
+          navigate('/marketplace');
+          toast.success('Navigated to buy now auctions');
         } catch (error) {
-          toast.error('Failed to load buy now auctions');
+          toast.error('Navigation failed');
         }
       }
@@ .. @@
       action: async () => {
         try {
-          const response = await apiService.getAuctions({ 
-            type: 'reverse',
-            status: 'active',
-            limit: 20 
-          });
-          toast.success(`Found ${response.data.auctions.length} reverse auctions`);
+          navigate('/marketplace');
+          toast.success('Navigated to reverse auctions');
         } catch (error) {
-          toast.error('Failed to load reverse auctions');
+          toast.error('Navigation failed');
         }
       }
@@ .. @@
         if (!isAuthenticated) {
-          toast.error('Please connect your wallet');
+          navigate('/');
           return;
         }
         
         try {
-          const [bidsResponse, auctionsResponse] = await Promise.all([
-            apiService.getMyBids({ limit: 100 }),
-            apiService.getAuctions({ seller: user?.id, limit: 100 })
-          ]);
-          
-          const totalBids = bidsResponse.data.bids.length;
-          const wonBids = bidsResponse.data.bids.filter(b => b.status === 'won').length;
-          const winRate = totalBids > 0 ? ((wonBids / totalBids) * 100).toFixed(1) : '0';
-          
-          toast.success(`Your Stats: ${totalBids} bids, ${winRate}% win rate`);
+          navigate(`/${user?.anonymousId}/profile`);
+          toast.success('Navigated to your profile');
         } catch (error) {
-          toast.error('Failed to load your activity');
+          toast.error('Navigation failed');
         }
       }
@@ .. @@
       action: async () => {
         if (!isAuthenticated) {
-          toast.error('Please connect your wallet');
+          navigate('/');
           return;
         }
         
@@ .. @@