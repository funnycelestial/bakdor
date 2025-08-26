// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract WKCToken is ERC20, Ownable, ReentrancyGuard {
    uint256 public constant INITIAL_SUPPLY = 1000000000 * 10**18; // 1 billion WKC
    uint256 public totalBurned = 0;
    
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    address public treasuryWallet;
    
    mapping(address => bool) public authorizedBurners;
    
    event TokensBurned(uint256 amount, address indexed burner, string reason);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event BurnerAuthorized(address indexed burner, bool authorized);
    
    constructor(address _treasuryWallet) ERC20("WikiCat Token", "WKC") {
        treasuryWallet = _treasuryWallet;
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    function burn(uint256 amount, string memory reason) external {
        require(authorizedBurners[msg.sender] || msg.sender == owner(), "Not authorized to burn");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance to burn");
        
        _transfer(msg.sender, BURN_ADDRESS, amount);
        totalBurned += amount;
        
        emit TokensBurned(amount, msg.sender, reason);
    }
    
    function burnFrom(address account, uint256 amount, string memory reason) external {
        require(authorizedBurners[msg.sender], "Not authorized to burn");
        require(allowance(account, msg.sender) >= amount, "Insufficient allowance");
        
        _spendAllowance(account, msg.sender, amount);
        _transfer(account, BURN_ADDRESS, amount);
        totalBurned += amount;
        
        emit TokensBurned(amount, account, reason);
    }
    
    function setTreasuryWallet(address _treasuryWallet) external onlyOwner {
        address oldTreasury = treasuryWallet;
        treasuryWallet = _treasuryWallet;
        emit TreasuryUpdated(oldTreasury, _treasuryWallet);
    }
    
    function authorizeBurner(address burner, bool authorized) external onlyOwner {
        authorizedBurners[burner] = authorized;
        emit BurnerAuthorized(burner, authorized);
    }
    
    function getCirculatingSupply() external view returns (uint256) {
        return totalSupply() - balanceOf(BURN_ADDRESS);
    }
    
    function getBurnRate() external view returns (uint256) {
        if (totalSupply() == 0) return 0;
        return (totalBurned * 10000) / INITIAL_SUPPLY; // Returns basis points
    }
}