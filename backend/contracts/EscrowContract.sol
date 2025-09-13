// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./WKCToken.sol";

contract EscrowContract is ReentrancyGuard, Ownable {
    WKCToken public wkcToken;
    
    uint256 private escrowCounter = 0;
    uint256 public disputeTimeLimit = 7 days;
    
    enum EscrowStatus { Created, Funded, Delivered, Completed, Disputed, Resolved }
    
    struct Escrow {
        uint256 id;
        uint256 auctionId;
        address buyer;
        address seller;
        uint256 amount;
        EscrowStatus status;
        uint256 createdAt;
        uint256 deliveryDeadline;
        bool buyerConfirmed;
        bool sellerConfirmed;
        string disputeReason;
        address arbitrator;
    }
    
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userEscrows;
    mapping(address => bool) public authorizedArbitrators;
    
    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed auctionId,
        address indexed buyer,
        address seller,
        uint256 amount
    );
    
    event EscrowFunded(uint256 indexed escrowId, uint256 amount);
    event DeliveryConfirmed(uint256 indexed escrowId, address confirmedBy);
    event EscrowCompleted(uint256 indexed escrowId, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, string reason, address raisedBy);
    event DisputeResolved(uint256 indexed escrowId, address winner, uint256 amount);
    
    constructor(address _wkcToken, address _treasuryWallet) {
        wkcToken = WKCToken(_wkcToken);
        authorizedArbitrators[owner()] = true;
    }
    
    function createEscrow(
        uint256 _auctionId,
        address _buyer,
        address _seller,
        uint256 _amount,
        uint256 _deliveryDays
    ) external returns (uint256) {
        require(_buyer != _seller, "Buyer and seller cannot be the same");
        require(_amount > 0, "Amount must be greater than 0");
        
        escrowCounter++;
        uint256 escrowId = escrowCounter;
        
        Escrow storage escrow = escrows[escrowId];
        escrow.id = escrowId;
        escrow.auctionId = _auctionId;
        escrow.buyer = _buyer;
        escrow.seller = _seller;
        escrow.amount = _amount;
        escrow.status = EscrowStatus.Created;
        escrow.createdAt = block.timestamp;
        escrow.deliveryDeadline = block.timestamp + (_deliveryDays * 1 days);
        
        userEscrows[_buyer].push(escrowId);
        userEscrows[_seller].push(escrowId);
        
        emit EscrowCreated(escrowId, _auctionId, _buyer, _seller, _amount);
        
        return escrowId;
    }
    
    function fundEscrow(uint256 _escrowId) external nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.buyer == msg.sender, "Only buyer can fund escrow");
        require(escrow.status == EscrowStatus.Created, "Escrow already funded");
        
        require(wkcToken.transferFrom(msg.sender, address(this), escrow.amount),
               "Failed to transfer tokens to escrow");
        
        escrow.status = EscrowStatus.Funded;
        
        emit EscrowFunded(_escrowId, escrow.amount);
    }
    
    function confirmDelivery(uint256 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Funded, "Escrow not funded");
        require(msg.sender == escrow.buyer || msg.sender == escrow.seller, 
               "Only buyer or seller can confirm delivery");
        
        if (msg.sender == escrow.buyer) {
            escrow.buyerConfirmed = true;
        } else {
            escrow.sellerConfirmed = true;
        }
        
        emit DeliveryConfirmed(_escrowId, msg.sender);
        
        // If both confirmed or buyer confirmed, release escrow
        if (escrow.buyerConfirmed || (escrow.sellerConfirmed && escrow.buyerConfirmed)) {
            _releaseEscrow(_escrowId);
        } else {
            escrow.status = EscrowStatus.Delivered;
        }
    }
    
    function _releaseEscrow(uint256 _escrowId) internal {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Funded || escrow.status == EscrowStatus.Delivered, 
               "Invalid escrow status");
        
        escrow.status = EscrowStatus.Completed;
        
        require(wkcToken.transfer(escrow.seller, escrow.amount),
               "Failed to release tokens to seller");
        
        emit EscrowCompleted(_escrowId, escrow.amount);
    }
    
    function raiseDispute(uint256 _escrowId, string memory _reason) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Funded || escrow.status == EscrowStatus.Delivered,
               "Invalid escrow status for dispute");
        require(msg.sender == escrow.buyer || msg.sender == escrow.seller,
               "Only buyer or seller can raise dispute");
        require(block.timestamp <= escrow.deliveryDeadline + disputeTimeLimit,
               "Dispute time limit exceeded");
        
        escrow.status = EscrowStatus.Disputed;
        escrow.disputeReason = _reason;
        
        emit DisputeRaised(_escrowId, _reason, msg.sender);
    }
    
    function resolveDispute(
        uint256 _escrowId,
        address _winner,
        uint256 _buyerAmount,
        uint256 _sellerAmount
    ) external {
        require(authorizedArbitrators[msg.sender], "Not authorized arbitrator");
        
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Disputed, "Escrow not disputed");
        require(_buyerAmount + _sellerAmount == escrow.amount, "Amounts don't match escrow");
        
        escrow.status = EscrowStatus.Resolved;
        escrow.arbitrator = msg.sender;
        
        if (_buyerAmount > 0) {
            require(wkcToken.transfer(escrow.buyer, _buyerAmount),
                   "Failed to transfer to buyer");
        }
        
        if (_sellerAmount > 0) {
            require(wkcToken.transfer(escrow.seller, _sellerAmount),
                   "Failed to transfer to seller");
        }
        
        emit DisputeResolved(_escrowId, _winner, escrow.amount);
    }
    
    function authorizeArbitrator(address _arbitrator, bool _authorized) external onlyOwner {
        authorizedArbitrators[_arbitrator] = _authorized;
    }
    
    function setDisputeTimeLimit(uint256 _timeLimit) external onlyOwner {
        disputeTimeLimit = _timeLimit;
    }
    
    function getEscrowDetails(uint256 _escrowId) external view returns (
        address buyer,
        address seller,
        uint256 amount,
        EscrowStatus status,
        uint256 deliveryDeadline,
        bool buyerConfirmed,
        bool sellerConfirmed
    ) {
        Escrow storage escrow = escrows[_escrowId];
        return (
            escrow.buyer,
            escrow.seller,
            escrow.amount,
            escrow.status,
            escrow.deliveryDeadline,
            escrow.buyerConfirmed,
            escrow.sellerConfirmed
        );
    }
}