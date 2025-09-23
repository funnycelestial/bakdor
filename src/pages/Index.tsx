@@ .. @@
+import { useEffect } from 'react';
+import { useNavigate } from 'react-router-dom';
+import { useWeb3 } from '@/contexts/Web3Context';
+import { Layout } from '@/components/layout/Layout';
 import AuctionDashboard from "/src/components/AuctionDashboard";

 const Index = () => {
-  return <AuctionDashboard />;
+  const { isAuthenticated, user } = useWeb3();
+  const navigate = useNavigate();
+
+  useEffect(() => {
+    // If user is authenticated, redirect to their dashboard
+    if (isAuthenticated && user) {
+      navigate(`/${user.anonymousId}`, { replace: true });
+    }
+  }, [isAuthenticated, user, navigate]);
+
+  // Show public marketplace for unauthenticated users
+  return (
+    <Layout>
+      <AuctionDashboard />
+    </Layout>
+  );
 };

 export default Index;