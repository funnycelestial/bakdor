// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./WKCToken.sol";

contract AuctionContract is ReentrancyGuard, Ownable {
    WKCToken public wkcToken;
    
    uint256 public platformFeePercentage = 300; // 3% in basis points
    uint256 public burnPercentage = 5000; // 50% of fees burned
    address public treasuryWallet;
    
    uint256 private auctionCounter = 0;
    
    struct Auction {
        uint256 id;
        address seller;
        string title;
        string description;
        uint256 startingBid;
        uint256 currentBid;
        uint256 reservePrice;
        uint256 buyNowPrice;
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        bool isActive;
        bool isReverse;
        uint256 totalBids;
        mapping(address => uint256) bidderAmounts;
        address[] bidders;
    }
    
    mapping(uint256 => Auction) public auctions;
    mapping(address => uint256[]) public userAuctions;
    mapping(address => uint256[]) public userBids;
    mapping(address => mapping(uint256 => uint256)) public lockedBids;
    
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        string title,
        uint256 startingBid,
        uint256 endTime,
        bool isReverse
    );
    
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 timestamp
    );
    
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid,
        uint256 platformFee,
        uint256 burnedAmount
    );
    
    event TokensBurned(
        uint256 amount,
        uint256 indexed auctionId,
        string reason
    );
    
    constructor(address _wkcToken, address _treasuryWallet) {
        wkcToken = WKCToken(_wkcToken);
        treasuryWallet = _treasuryWallet;
    }
    
    function createAuction(
        string memory _title,
        string memory _description,
        uint256 _startingBid,
        uint256 _reservePrice,
        uint256 _buyNowPrice,
        uint256 _duration,
        bool _isReverse
    ) external returns (uint256) {
        require(_startingBid > 0, "Starting bid must be greater than 0");
        require(_duration >= 3600, "Auction must run for at least 1 hour");
        
        auctionCounter++;
        uint256 auctionId = auctionCounter;
        
        Auction storage auction = auctions[auctionId];
        auction.id = auctionId;
        auction.seller = msg.sender;
        auction.title = _title;
        auction.description = _description;
        auction.startingBid = _startingBid;
        auction.currentBid = _isReverse ? _startingBid : 0;
        auction.reservePrice = _reservePrice;
        auction.buyNowPrice = _buyNowPrice;
        auction.startTime = block.timestamp;
        auction.endTime = block.timestamp + _duration;
        auction.isActive = true;
        auction.isReverse = _isReverse;
        auction.totalBids = 0;
        
        userAuctions[msg.sender].push(auctionId);
        
        emit AuctionCreated(
            auctionId,
            msg.sender,
            _title,
            _startingBid,
            auction.endTime,
            _isReverse
        );
        
        return auctionId;
    }
    
    function placeBid(uint256 _auctionId, uint256 _bidAmount) external nonReentrant {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction has ended");
        require(msg.sender != auction.seller, "Seller cannot bid on own auction");
        
        if (auction.isReverse) {
            require(_bidAmount < auction.currentBid || auction.currentBid == auction.startingBid, 
                   "Bid must be lower than current bid");
        } else {
            require(_bidAmount > auction.currentBid, "Bid must be higher than current bid");
        }
        
        // Lock tokens for bid
        require(wkcToken.transferFrom(msg.sender, address(this), _bidAmount), 
               "Failed to lock tokens");
        
        // Refund previous highest bidder if exists
        if (auction.highestBidder != address(0) && auction.currentBid > 0) {
            require(wkcToken.transfer(auction.highestBidder, auction.currentBid),
                   "Failed to refund previous bidder");
            lockedBids[auction.highestBidder][_auctionId] = 0;
        }
        
        // Update auction state
        auction.currentBid = _bidAmount;
        auction.highestBidder = msg.sender;
        auction.totalBids++;
        auction.bidderAmounts[msg.sender] = _bidAmount;
        lockedBids[msg.sender][_auctionId] = _bidAmount;
        
        // Add to bidder list if first time
        bool isNewBidder = true;
        for (uint i = 0; i < auction.bidders.length; i++) {
            if (auction.bidders[i] == msg.sender) {
                isNewBidder = false;
                break;
            }
        }
        if (isNewBidder) {
            auction.bidders.push(msg.sender);
            userBids[msg.sender].push(_auctionId);
        }
        
        // Auto-extend auction if bid placed in last 5 minutes
        if (auction.endTime - block.timestamp < 300) {
            auction.endTime += 300; // Extend by 5 minutes
        }
        
        emit BidPlaced(_auctionId, msg.sender, _bidAmount, block.timestamp);
    }
    
    function endAuction(uint256 _auctionId) external {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp >= auction.endTime || msg.sender == auction.seller, 
               "Auction has not ended yet");
        
        auction.isActive = false;
        
        if (auction.highestBidder != address(0) && auction.currentBid >= auction.reservePrice) {
            // Calculate platform fee
            uint256 platformFee = (auction.currentBid * platformFeePercentage) / 10000;
            uint256 burnAmount = (platformFee * burnPercentage) / 10000;
            uint256 treasuryAmount = platformFee - burnAmount;
            uint256 sellerAmount = auction.currentBid - platformFee;
            
            // Transfer to seller
            require(wkcToken.transfer(auction.seller, sellerAmount), 
                   "Failed to transfer to seller");
            
            // Transfer to treasury
            if (treasuryAmount > 0) {
                require(wkcToken.transfer(treasuryWallet, treasuryAmount), 
                       "Failed to transfer to treasury");
            }
            
            // Burn tokens
            if (burnAmount > 0) {
                wkcToken.burn(burnAmount, "Platform fee burn");
                emit TokensBurned(burnAmount, _auctionId, "Platform fee burn");
            }
            
            // Clear locked bid
            lockedBids[auction.highestBidder][_auctionId] = 0;
            
            emit AuctionEnded(_auctionId, auction.highestBidder, auction.currentBid, platformFee, burnAmount);
        } else {
            // No winner, refund highest bidder
            if (auction.highestBidder != address(0)) {
                require(wkcToken.transfer(auction.highestBidder, auction.currentBid),
                       "Failed to refund bidder");
                lockedBids[auction.highestBidder][_auctionId] = 0;
            }
            
            emit AuctionEnded(_auctionId, address(0), 0, 0, 0);
        }
    }
    
    function buyNow(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(auction.buyNowPrice > 0, "Buy now not available");
        require(msg.sender != auction.seller, "Seller cannot buy own item");
        
        uint256 buyNowPrice = auction.buyNowPrice;
        
        // Transfer buy now amount
        require(wkcToken.transferFrom(msg.sender, address(this), buyNowPrice),
               "Failed to transfer buy now amount");
        
        // Refund current highest bidder if exists
        if (auction.highestBidder != address(0) && auction.currentBid > 0) {
            require(wkcToken.transfer(auction.highestBidder, auction.currentBid),
                   "Failed to refund previous bidder");
            lockedBids[auction.highestBidder][_auctionId] = 0;
        }
        
        // Calculate fees
        uint256 platformFee = (buyNowPrice * platformFeePercentage) / 10000;
        uint256 burnAmount = (platformFee * burnPercentage) / 10000;
        uint256 treasuryAmount = platformFee - burnAmount;
        uint256 sellerAmount = buyNowPrice - platformFee;
        
        // Process payments
        require(wkcToken.transfer(auction.seller, sellerAmount), "Failed to transfer to seller");
        if (treasuryAmount > 0) {
            require(wkcToken.transfer(treasuryWallet, treasuryAmount), "Failed to transfer to treasury");
        }
        if (burnAmount > 0) {
            wkcToken.burn(burnAmount, "Buy now platform fee burn");
            emit TokensBurned(burnAmount, _auctionId, "Buy now platform fee burn");
        }
        
        // End auction
        auction.isActive = false;
        auction.currentBid = buyNowPrice;
        auction.highestBidder = msg.sender;
        
        emit AuctionEnded(_auctionId, msg.sender, buyNowPrice, platformFee, burnAmount);
    }
    
    function getAuctionDetails(uint256 _auctionId) external view returns (
        address seller,
        string memory title,
        uint256 currentBid,
        uint256 endTime,
        address highestBidder,
        bool isActive,
        bool isReverse,
        uint256 totalBids
    ) {
        Auction storage auction = auctions[_auctionId];
        return (
            auction.seller,
            auction.title,
            auction.currentBid,
            auction.endTime,
            auction.highestBidder,
            auction.isActive,
            auction.isReverse,
            auction.totalBids
        );
    }
    
    function getUserAuctions(address user) external view returns (uint256[] memory) {
        return userAuctions[user];
    }
    
    function getUserBids(address user) external view returns (uint256[] memory) {
        return userBids[user];
    }
    
    function setPlatformFee(uint256 _feePercentage) external onlyOwner {
        require(_feePercentage <= 1000, "Fee cannot exceed 10%");
        platformFeePercentage = _feePercentage;
    }
    
    function setBurnPercentage(uint256 _burnPercentage) external onlyOwner {
        require(_burnPercentage <= 10000, "Burn percentage cannot exceed 100%");
        burnPercentage = _burnPercentage;
    }
}