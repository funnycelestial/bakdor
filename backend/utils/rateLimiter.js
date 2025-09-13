class RateLimiter {
  constructor(maxRequests, intervalMs) {
    this.maxRequests = maxRequests;
    this.intervalMs = intervalMs;
    this.requests = [];
  }

  async waitForAvailability() {
    const now = Date.now();
    
    // Remove old requests outside the interval
    this.requests = this.requests.filter(time => now - time < this.intervalMs);
    
    // If we've reached the limit, wait until the oldest request is outside the interval
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.intervalMs - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForAvailability(); // Recursive call to check again
      }
    }
    
    // Record this request
    this.requests.push(now);
    return true;
  }
}

module.exports = RateLimiter;