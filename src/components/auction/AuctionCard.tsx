@@ .. @@
 import { useState } from 'react';
+import { useNavigate } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { apiService } from '@/lib/api';
@@ .. @@
 export const AuctionCard = ({ auctionId, item, currentBid, timeLeft, category, isHot, auctionType = 'forward', watchers, onBidClick }: AuctionCardProps) => {
   const isUrgent = timeLeft.includes('m') && parseInt(timeLeft) < 10;
   const isReverse = auctionType === 'reverse';
   const { isAuthenticated, user, balance, connectWallet, isConnecting } = useWeb3();
+  const navigate = useNavigate();
   const [isPlacingBid, setIsPlacingBid] = useState(false);
@@ .. @@
   
   return (
-    <div className={`border border-panel-border bg-secondary/20 p-3 transition-all hover:bg-secondary/30 hover:border-terminal-green/50 ${isHot ? 'animate-glow' : ''} min-w-0`}>
+    <div 
+      className={`border border-panel-border bg-secondary/20 p-3 transition-all hover:bg-secondary/30 hover:border-terminal-green/50 cursor-pointer ${isHot ? 'animate-glow' : ''} min-w-0`}
+      onClick={() => navigate(`/auction/${auctionId}`)}
+    >
       <div className="text-xs">
         <div className="flex items-center gap-2 mb-2">
@@ .. @@
         <div className="flex gap-2">
           <button 
             onClick={handleWatchClick}
+            onClick={(e) => {
+              e.stopPropagation();
+              handleWatchClick();
+            }}
             className="bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors flex-shrink-0 min-w-0"
           >
@@ .. @@
           {isAuthenticated ? (
             <button 
               onClick={handleBidClick}
+              onClick={(e) => {
+                e.stopPropagation();
+                handleBidClick();
+              }}
               disabled={isPlacingBid}
@@ .. @@
           ) : (
             <button 
               onClick={connectWallet}
+              onClick={(e) => {
+                e.stopPropagation();
+                connectWallet();
+              }}
               disabled={isConnecting}
@@ .. @@