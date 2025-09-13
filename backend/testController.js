// testController.js
try {
  console.log('Testing auctionController...');
  require('./controllers/auctionController');
  console.log('✅ auctionController loaded successfully');
} catch (error) {
  console.error('❌ Error loading auctionController:', error.message);
  console.error(error.stack);
}
// testRoute.js
try {
  console.log('Testing auctionRoutes...');
  require('./routes/auctionRoutes');
  console.log('✅ auctionRoutes loaded successfully');
} catch (error) {
  console.error('❌ Error loading auctionRoutes:', error.message);
  console.error(error.stack);
}