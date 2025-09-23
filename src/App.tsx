@@ .. @@
 import { Toaster } from "@/components/ui/toaster";
 import { Toaster as Sonner } from "@/components/ui/sonner";
 import { TooltipProvider } from "@/components/ui/tooltip";
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 import { BrowserRouter, Routes, Route } from "react-router-dom";
 import { Web3Provider } from "@/contexts/Web3Context";
 import Index from "./pages/Index";
+import UserDashboard from "./pages/UserDashboard";
+import AuctionDetails from "./pages/AuctionDetails";
+import CreateAuction from "./pages/CreateAuction";
+import UserProfile from "./pages/UserProfile";
+import Marketplace from "./pages/Marketplace";
+import ProtectedRoute from "./components/auth/ProtectedRoute";
 import NotFound from "./pages/NotFound";

 const queryClient = new QueryClient();

 const App = () => (
   <QueryClientProvider client={queryClient}>
     <Web3Provider>
       <TooltipProvider>
         <Toaster />
         <Sonner />
         <BrowserRouter>
           <Routes>
             <Route path="/" element={<Index />} />
+            <Route path="/marketplace" element={<Marketplace />} />
+            <Route path="/auction/:auctionId" element={<AuctionDetails />} />
+            
+            {/* Protected User Routes */}
+            <Route path="/:anonymousId" element={
+              <ProtectedRoute>
+                <UserDashboard />
+              </ProtectedRoute>
+            } />
+            <Route path="/:anonymousId/profile" element={
+              <ProtectedRoute>
+                <UserProfile />
+              </ProtectedRoute>
+            } />
+            <Route path="/:anonymousId/create" element={
+              <ProtectedRoute>
+                <CreateAuction />
+              </ProtectedRoute>
+            } />
+            <Route path="/:anonymousId/auctions" element={
+              <ProtectedRoute>
+                <UserDashboard />
+              </ProtectedRoute>
+            } />
+            <Route path="/:anonymousId/bids" element={
+              <ProtectedRoute>
+                <UserDashboard />
+              </ProtectedRoute>
+            } />
+            <Route path="/:anonymousId/watchlist" element={
+              <ProtectedRoute>
+                <UserDashboard />
+              </ProtectedRoute>
+            } />
+            
             {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
             <Route path="*" element={<NotFound />} />
           </Routes>
         </BrowserRouter>
       </TooltipProvider>
     </Web3Provider>
   </QueryClientProvider>
 );

 export default App;