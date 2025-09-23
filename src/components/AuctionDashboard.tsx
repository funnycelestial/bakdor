@@ .. @@
               <TabsContent value="create" className="space-y-4">
-                <CreateAuction />
+                {isAuthenticated ? (
+                  <CreateAuction />
+                ) : (
+                  <Card className="border-panel-border bg-card/50 p-8">
+                    <div className="text-center space-y-4">
+                      <div className="text-terminal-amber text-4xl">🔐</div>
+                      <h3 className="text-xl font-bold text-foreground">Authentication Required</h3>
+                      <p className="text-muted-foreground">
+                        Connect your wallet to create auctions
+                      </p>
+                    </div>
+                  </Card>
+                )}
               </TabsContent>
               
               <TabsContent value="my-auctions" className="space-y-4">
-                <MyAuctions />
+                {isAuthenticated ? (
+                  <MyAuctions />
+                ) : (
+                  <Card className="border-panel-border bg-card/50 p-8">
+                    <div className="text-center space-y-4">
+                      <div className="text-terminal-amber text-4xl">🔐</div>
+                      <h3 className="text-xl font-bold text-foreground">Authentication Required</h3>
+                      <p className="text-muted-foreground">
+                        Connect your wallet to view your auctions
+                      </p>
+                    </div>
+                  </Card>
+                )}
               </TabsContent>
               
               <TabsContent value="watchlist" className="space-y-4">
-                <WatchlistManager />
+                {isAuthenticated ? (
+                  <WatchlistManager />
+                ) : (
+                  <Card className="border-panel-border bg-card/50 p-8">
+                    <div className="text-center space-y-4">
+                      <div className="text-terminal-amber text-4xl">🔐</div>
+                      <h3 className="text-xl font-bold text-foreground">Authentication Required</h3>
+                      <p className="text-muted-foreground">
+                        Connect your wallet to manage your watchlist
+                      </p>
+                    </div>
+                  </Card>
+                )}
               </TabsContent>
               
               <TabsContent value="analytics" className="space-y-4">
-                <AdvancedAnalytics />
+                {isAuthenticated ? (
+                  <AdvancedAnalytics />
+                ) : (
+                  <Card className="border-panel-border bg-card/50 p-8">
+                    <div className="text-center space-y-4">
+                      <div className="text-terminal-amber text-4xl">📊</div>
+                      <h3 className="text-xl font-bold text-foreground">Authentication Required</h3>
+                      <p className="text-muted-foreground">
+                        Connect your wallet to view analytics
+                      </p>
+                    </div>
+                  </Card>
+                )}
               </TabsContent>
               
               <TabsContent value="transparency">
@@ .. @@