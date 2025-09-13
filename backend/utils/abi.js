// utils/abi.js

// Full ABIs (functions + events)
const wkcTokenFullAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function getCirculatingSupply() view returns (uint256)",
  "function getBurnRate() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function burn(uint256 amount, string reason)",
  "function burnFrom(address account, uint256 amount, string reason)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event TokensBurned(uint256 amount, address indexed burner, string reason)"
];

const auctionFullAbi = [
  "function createAuction(string title, string description, uint256 startingBid, uint256 reservePrice, uint256 buyNowPrice, uint256 duration, bool isReverse) returns (uint256)",
  "function placeBid(uint256 auctionId, uint256 bidAmount)",
  "function buyNow(uint256 auctionId)",
  "function endAuction(uint256 auctionId)",
  "function getAuctionDetails(uint256 auctionId) view returns (address seller, string title, uint256 currentBid, uint256 endTime, address highestBidder, bool isActive, bool isReverse, uint256 totalBids)",
  "function getUserAuctions(address user) view returns (uint256[])",
  "function getUserBids(address user) view returns (uint256[])",
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string title, uint256 startingBid, uint256 endTime, bool isReverse)",
  "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
  "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 winningBid, uint256 platformFee, uint256 burnedAmount)",
  "event TokensBurned(uint256 amount, uint256 indexed auctionId, string reason)"
];

const escrowFullAbi = [
  "function createEscrow(uint256 auctionId, address buyer, address seller, uint256 amount, uint256 deliveryDays) returns (uint256)",
  "function fundEscrow(uint256 escrowId)",
  "function confirmDelivery(uint256 escrowId)",
  "function raiseDispute(uint256 escrowId, string reason)",
  "function resolveDispute(uint256 escrowId, address winner, uint256 buyerAmount, uint256 sellerAmount)",
  "function getEscrowDetails(uint256 escrowId) view returns (address buyer, address seller, uint256 amount, uint8 status, uint256 deliveryDeadline, bool buyerConfirmed, bool sellerConfirmed)",
  "event EscrowCreated(uint256 indexed escrowId, uint256 indexed auctionId, address indexed buyer, address seller, uint256 amount)",
  "event EscrowFunded(uint256 indexed escrowId)",
  "event DeliveryConfirmed(uint256 indexed escrowId, address confirmedBy)",
  "event EscrowCompleted(uint256 indexed escrowId, uint256 amount)",
  "event DisputeRaised(uint256 indexed escrowId, string reason, address raisedBy)",
  "event DisputeResolved(uint256 indexed escrowId, address winner, uint256 amount)"
];

// Helper function to extract events from full ABI
const extractEvents = (fullAbi) => {
  return fullAbi.filter(item => item.startsWith('event'));
};

// Generate event-only ABIs programmatically
const wkcTokenEventAbi = extractEvents(wkcTokenFullAbi);
const auctionEventAbi = extractEvents(auctionFullAbi);
const escrowEventAbi = extractEvents(escrowFullAbi);

// Export structured ABIs
module.exports = {
  wkcToken: {
    full: wkcTokenFullAbi,
    event: wkcTokenEventAbi
  },
  auction: {
    full: auctionFullAbi,
    event: auctionEventAbi
  },
  escrow: {
    full: escrowFullAbi,
    event: escrowEventAbi
  }
};