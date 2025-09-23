@@ .. @@
 import { Badge } from '@/components/ui/badge';
+import { useNavigate } from 'react-router-dom';
 import { useWeb3 } from '@/contexts/Web3Context';
 import { formatTokenAmount } from '@/utils/formatters';

 export const Footer = () => {
   const { tokenInfo } = useWeb3();
+  const navigate = useNavigate();

   return (
@@ .. @@
         {/* Links & Support */}
         <div className="space-y-2">
           <h4 className="text-sm font-medium text-terminal-green">Support</h4>
           <div className="space-y-1 text-xs text-muted-foreground">
-            <div className="hover:text-terminal-green cursor-pointer transition-colors">
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="hover:text-terminal-green cursor-pointer transition-colors block"
+            >
               How It Works
-            </div>
-            <div className="hover:text-terminal-green cursor-pointer transition-colors">
+            </button>
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="hover:text-terminal-green cursor-pointer transition-colors block"
+            >
               Fee Structure
-            </div>
-            <div className="hover:text-terminal-green cursor-pointer transition-colors">
+            </button>
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="hover:text-terminal-green cursor-pointer transition-colors block"
+            >
               Security Guide
-            </div>
-            <div className="hover:text-terminal-green cursor-pointer transition-colors">
+            </button>
+            <button 
+              onClick={() => navigate('/marketplace')}
+              className="hover:text-terminal-green cursor-pointer transition-colors block"
+            >
               Contact Support
-            </div>
+            </button>
           </div>
         </div>
@@ .. @@
           <div className="text-xs text-muted-foreground">
             © 2025 The Backdoor. All rights reserved.
+            <div className="mt-1">
+              Every transaction on The Backdoor burns tokens forever
+            </div>
           </div>
           
           <div className="flex items-center gap-4">
@@ .. @@
         </div>
-              Every transaction on The Backdoor burns tokens forever
     </footer>
   );
 };
-  )
-}