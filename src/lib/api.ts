@@ .. @@
   // Authentication - matches backend endpoints exactly
   async login(walletAddress: string, signature?: string) {
     const body: any = { walletAddress: walletAddress.toLowerCase() };
     if (signature) {
       body.signature = signature;
       // The message is reconstructed on backend, so we don't need to send it
     }
     
-    return this.request('/users/login', {
+    const response = await this.request('/users/login', {
       method: 'POST',
       body: JSON.stringify(body),
     });
+    
+    // Store auth token if login is successful and token is provided
+    if (response.token) {
+      this.setAuthToken(response.token);
+    }
+    
+    return response;
   }

   async getProfile() {
@@ .. @@