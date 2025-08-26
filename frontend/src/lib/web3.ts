import { ethers } from 'ethers';

// Environment variables for contract addresses
const WKC_CONTRACT_ADDRESS = import.meta.env.VITE_WKC_CONTRACT_ADDRESS || '0x1234567890123456789012345678901234567890';
const AUCTION_CONTRACT_ADDRESS = import.meta.env.VITE_AUCTION_CONTRACT_ADDRESS || '0x2345678901234567890123456789012345678901';
const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS || '0x3456789012345678901234567890123456789012';

export interface WalletConnection {
  address: string;
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
  chainId: number;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  totalBurned: string;
  circulatingSupply: string;
  burnRate: number;
}

export interface AuctionData {
  id: string;
  title: string;
  description: string;
  currentBid: string;
  endTime: number;
  seller: string;
  isActive: boolean;
  totalBids: number;
}

class Web3Service {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private contracts: { [key: string]: ethers.Contract } = {};

  // Contract ABIs (simplified for frontend)
  private readonly WKC_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function totalBurned() view returns (uint256)",
    "function getCirculatingSupply() view returns (uint256)",
    "function getBurnRate() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event TokensBurned(uint256 amount, address indexed burner, string reason)"
  ];

  private readonly AUCTION_ABI = [
    "function createAuction(string title, string description, uint256 startingBid, uint256 reservePrice, uint256 buyNowPrice, uint256 duration, bool isReverse) returns (uint256)",
    "function placeBid(uint256 auctionId, uint256 bidAmount)",
    "function getAuctionDetails(uint256 auctionId) view returns (address seller, string title, uint256 currentBid, uint256 endTime, address highestBidder, bool isActive, bool isReverse, uint256 totalBids)",
    "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string title, uint256 startingBid, uint256 endTime, bool isReverse)",
    "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 timestamp)",
    "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 winningBid, uint256 platformFee, uint256 burnedAmount)"
  ];

  async connectWallet(): Promise<WalletConnection> {
    if (!window.ethereum) {
      throw new Error('MetaMask not detected');
    }

    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      const network = await this.provider.getNetwork();

      // Initialize contracts
      this.initializeContracts();

      return {
        address,
        provider: this.provider,
        signer: this.signer,
        chainId: Number(network.chainId)
      };
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }

  private initializeContracts() {
    if (!this.signer) return;

    // Initialize WKC Token contract
    this.contracts.wkcToken = new ethers.Contract(
      WKC_CONTRACT_ADDRESS,
      this.WKC_ABI,
      this.signer
    );

    // Initialize Auction contract
    this.contracts.auction = new ethers.Contract(
      AUCTION_CONTRACT_ADDRESS,
      this.AUCTION_ABI,
      this.signer
    );

    // Initialize Escrow contract
    this.contracts.escrow = new ethers.Contract(
      ESCROW_CONTRACT_ADDRESS,
      [
        "function createEscrow(uint256 auctionId, address buyer, address seller, uint256 amount, uint256 deliveryDays) returns (uint256)",
        "function confirmDelivery(uint256 escrowId)",
        "function getEscrowDetails(uint256 escrowId) view returns (address buyer, address seller, uint256 amount, uint8 status, uint256 deliveryDeadline, bool buyerConfirmed, bool sellerConfirmed)",
        "event EscrowCreated(uint256 indexed escrowId, uint256 indexed auctionId, address indexed buyer, address seller, uint256 amount)",
        "event EscrowCompleted(uint256 indexed escrowId, uint256 amount)"
      ],
      this.signer
    );
  }

  async getTokenInfo(): Promise<TokenInfo> {
    if (!this.contracts.wkcToken) throw new Error('Contract not initialized');

    try {
      const [name, symbol, decimals, totalSupply, totalBurned, circulatingSupply, burnRate] = await Promise.all([
        this.contracts.wkcToken.name(),
        this.contracts.wkcToken.symbol(),
        this.contracts.wkcToken.decimals(),
        this.contracts.wkcToken.totalSupply(),
        this.contracts.wkcToken.totalBurned(),
        this.contracts.wkcToken.getCirculatingSupply(),
        this.contracts.wkcToken.getBurnRate()
      ]);

      return {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        totalBurned: ethers.formatUnits(totalBurned, decimals),
        circulatingSupply: ethers.formatUnits(circulatingSupply, decimals),
        burnRate: Number(burnRate) / 100
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      throw error;
    }
  }

  async getTokenBalance(address: string): Promise<string> {
    if (!this.contracts.wkcToken) throw new Error('Contract not initialized');

    try {
      const balance = await this.contracts.wkcToken.balanceOf(address);
      const decimals = await this.contracts.wkcToken.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting token balance:', error);
      throw error;
    }
  }

  async placeBid(auctionId: string, amount: string): Promise<string> {
    if (!this.contracts.auction) throw new Error('Contract not initialized');

    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const amountInWei = ethers.parseUnits(amount, decimals);
      
      // First approve token spending
      const approveTx = await this.contracts.wkcToken.approve(
        this.contracts.auction.target,
        amountInWei
      );
      await approveTx.wait();

      // Then place bid
      const bidTx = await this.contracts.auction.placeBid(auctionId, amountInWei);
      const receipt = await bidTx.wait();
      
      return receipt.hash;
    } catch (error) {
      console.error('Error placing bid:', error);
      throw error;
    }
  }

  async getAuctionDetails(auctionId: string): Promise<AuctionData> {
    if (!this.contracts.auction) throw new Error('Contract not initialized');

    try {
      const details = await this.contracts.auction.getAuctionDetails(auctionId);
      const decimals = await this.contracts.wkcToken.decimals();

      return {
        id: auctionId,
        title: details.title,
        description: '', // Would need to be fetched from IPFS or backend
        currentBid: ethers.formatUnits(details.currentBid, decimals),
        endTime: Number(details.endTime),
        seller: details.seller,
        isActive: details.isActive,
        totalBids: Number(details.totalBids)
      };
    } catch (error) {
      console.error('Error getting auction details:', error);
      throw error;
    }
  }

  setupEventListeners(callbacks: {
    onBidPlaced?: (auctionId: string, bidder: string, amount: string) => void;
    onAuctionEnded?: (auctionId: string, winner: string, winningBid: string) => void;
    onTokensBurned?: (amount: string, reason: string) => void;
    onEscrowCreated?: (escrowId: string, auctionId: string, amount: string) => void;
    onEscrowCompleted?: (escrowId: string, amount: string) => void;
  }) {
    if (!this.contracts.wkcToken || !this.contracts.auction) return;

    // Listen for token burns
    this.contracts.wkcToken.on('TokensBurned', (amount, burner, reason, event) => {
      const burnAmount = ethers.formatUnits(amount, 18);
      callbacks.onTokensBurned?.(burnAmount, reason);
    });

    // Listen for bids
    this.contracts.auction.on('BidPlaced', (auctionId, bidder, amount, timestamp, event) => {
      const bidAmount = ethers.formatUnits(amount, 18);
      callbacks.onBidPlaced?.(auctionId.toString(), bidder, bidAmount);
    });

    // Listen for auction endings
    this.contracts.auction.on('AuctionEnded', (auctionId, winner, winningBid, platformFee, burnedAmount, event) => {
      const winAmount = ethers.formatUnits(winningBid, 18);
      callbacks.onAuctionEnded?.(auctionId.toString(), winner, winAmount);
    });

    // Listen for escrow events
    if (this.contracts.escrow) {
      this.contracts.escrow.on('EscrowCreated', (escrowId, auctionId, buyer, seller, amount, event) => {
        const escrowAmount = ethers.formatUnits(amount, 18);
        callbacks.onEscrowCreated?.(escrowId.toString(), auctionId.toString(), escrowAmount);
      });

      this.contracts.escrow.on('EscrowCompleted', (escrowId, amount, event) => {
        const completedAmount = ethers.formatUnits(amount, 18);
        callbacks.onEscrowCompleted?.(escrowId.toString(), completedAmount);
      });
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.signer) throw new Error('Wallet not connected');
    return await this.signer.signMessage(message);
  }

  async createAuction(auctionData: {
    title: string;
    description: string;
    startingBid: string;
    reservePrice?: string;
    buyNowPrice?: string;
    duration: number;
    isReverse?: boolean;
  }): Promise<string> {
    if (!this.contracts.auction) throw new Error('Contract not initialized');

    try {
      const decimals = await this.contracts.wkcToken.decimals();
      const startingBidInWei = ethers.parseUnits(auctionData.startingBid, decimals);
      const reservePriceInWei = auctionData.reservePrice ? ethers.parseUnits(auctionData.reservePrice, decimals) : 0;
      const buyNowPriceInWei = auctionData.buyNowPrice ? ethers.parseUnits(auctionData.buyNowPrice, decimals) : 0;
      
      const tx = await this.contracts.auction.createAuction(
        auctionData.title,
        auctionData.description,
        startingBidInWei,
        reservePriceInWei,
        buyNowPriceInWei,
        auctionData.duration,
        auctionData.isReverse || false
      );
      
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error('Error creating auction:', error);
      throw error;
    }
  }

  async confirmEscrowDelivery(escrowId: string): Promise<string> {
    if (!this.contracts.escrow) throw new Error('Escrow contract not initialized');

    try {
      const tx = await this.contracts.escrow.confirmDelivery(escrowId);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error('Error confirming delivery:', error);
      throw error;
    }
  }

  disconnect() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
  }
}

export const web3Service = new Web3Service();

// Utility functions
export const formatEthAmount = (amount: string, decimals: number = 18): string => {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return num.toFixed(4);
};

// Global window type extension
declare global {
  interface Window {
    ethereum?: any;
  }
}