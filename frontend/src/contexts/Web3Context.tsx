import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { web3Service, WalletConnection, TokenInfo } from '@/lib/web3';
import { apiService, User } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface Web3ContextType {
  // Wallet state
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  chainId: number | null;
  
  // User state
  user: User | null;
  isAuthenticated: boolean;
  
  // Token state
  tokenInfo: TokenInfo | null;
  balance: string;
  
  // Actions
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshBalance: () => Promise<void>;
  refreshTokenInfo: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | null>(null);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

interface Web3ProviderProps {
  children: ReactNode;
}

export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState('0');

  // Format token amount utility function
  const formatTokenAmount = (amt: string): string => {
    const num = parseFloat(amt);
    return num >= 1000 ? `${(num/1000).toFixed(1)}K` : num.toFixed(2);
  };

  // Check for existing connection on mount
  useEffect(() => {
    checkExistingConnection();
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const checkExistingConnection = async () => {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const connection = await web3Service.connectWallet();
          setWalletAddress(connection.address);
          setChainId(connection.chainId);
          setIsConnected(true);
          
          // Check for existing auth token
          const token = apiService.getAuthToken();
          if (token) {
            try {
              const response = await apiService.getProfile();
              setUser(response.data.user);
              setIsAuthenticated(true);
              
              // Connect WebSocket
              apiService.connectSocket(token);
              
              // Setup blockchain event listeners
              web3Service.setupEventListeners({
                onBidPlaced: (auctionId, bidder, amount) => {
                  console.log(`Bid placed: ${amount} WKC on auction ${auctionId}`);
                },
                onAuctionEnded: (auctionId, winner, winningBid) => {
                  console.log(`Auction ${auctionId} ended. Winner: ${winner}, Amount: ${winningBid} WKC`);
                },
                onTokensBurned: (amount, reason) => {
                  console.log(`Tokens burned: ${amount} WKC. Reason: ${reason}`);
                  toast.success(`🔥 ${formatTokenAmount(amount)} WKC burned!`);
                },
                onEscrowCreated: (escrowId, auctionId, amount) => {
                  console.log(`Escrow created: ${escrowId} for ${amount} WKC`);
                },
                onEscrowCompleted: (escrowId, amount) => {
                  console.log(`Escrow completed: ${escrowId}, ${amount} WKC released`);
                }
              });
              
              // Load initial data
              await Promise.all([
                refreshBalance(),
                refreshTokenInfo()
              ]);
            } catch (error) {
              console.error('Failed to load user profile:', error);
              apiService.clearAuthToken();
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing connection:', error);
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else if (accounts[0] !== walletAddress) {
      // Account changed, reconnect
      connectWallet();
    }
  };

  const handleChainChanged = (chainId: string) => {
    setChainId(parseInt(chainId, 16));
    // Optionally reload or show network change notification
    toast.info('Network changed. Please refresh if you experience issues.');
  };

  const connectWallet = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    
    try {
      // Connect wallet
      const connection = await web3Service.connectWallet();
      setWalletAddress(connection.address);
      setChainId(connection.chainId);
      setIsConnected(true);
      
      // Generate authentication message
      const message = `Welcome to Anonymous Auction Platform!\n\nSign this message to authenticate your wallet.\n\nWallet: ${connection.address}\nTimestamp: ${Date.now()}`;
      
      // Sign message for authentication
      const signature = await web3Service.signMessage(message);
      
      // Check if user exists, if not register
      try {
        const loginResponse = await apiService.login(connection.address, signature, message);
        setUser(loginResponse.data.user);
        setIsAuthenticated(true);
        apiService.setAuthToken(loginResponse.data.token);
        toast.success(`Welcome back, ${loginResponse.data.user.anonymousId}!`);
      } catch (loginError: any) {
        if (loginError.message.includes('User not found')) {
          // Register new user
          const registerResponse = await apiService.register(connection.address, signature, message);
          setUser(registerResponse.data.user);
          setIsAuthenticated(true);
          apiService.setAuthToken(registerResponse.data.token);
          toast.success(`Welcome to the platform, ${registerResponse.data.user.anonymousId}!`);
        } else {
          throw loginError;
        }
      }
      
      // Connect WebSocket for real-time updates
      const token = apiService.getAuthToken();
      if (token) {
        apiService.connectSocket(token);
        
        // Setup blockchain event listeners
        web3Service.setupEventListeners({
          onBidPlaced: (auctionId, bidder, amount) => {
            console.log(`Bid placed: ${amount} WKC on auction ${auctionId}`);
          },
          onAuctionEnded: (auctionId, winner, winningBid) => {
            console.log(`Auction ${auctionId} ended. Winner: ${winner}, Amount: ${winningBid} WKC`);
          },
          onTokensBurned: (amount, reason) => {
            console.log(`Tokens burned: ${amount} WKC. Reason: ${reason}`);
            toast.success(`🔥 ${formatTokenAmount(amount)} WKC burned!`);
          },
          onEscrowCreated: (escrowId, auctionId, amount) => {
            console.log(`Escrow created: ${escrowId} for ${amount} WKC`);
          },
          onEscrowCompleted: (escrowId, amount) => {
            console.log(`Escrow completed: ${escrowId}, ${amount} WKC released`);
          }
        });
      }
      
      // Load initial data
      await Promise.all([
        refreshBalance(),
        refreshTokenInfo()
      ]);
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      toast.error(error.message || 'Failed to connect wallet');
      setIsConnected(false);
      setWalletAddress(null);
      setChainId(null);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    web3Service.disconnect();
    apiService.clearAuthToken();
    apiService.disconnectSocket();
    setIsConnected(false);
    setWalletAddress(null);
    setChainId(null);
    setUser(null);
    setIsAuthenticated(false);
    setTokenInfo(null);
    setBalance('0');
    toast.info('Wallet disconnected');
  };

  const refreshBalance = async () => {
    if (!walletAddress) return;
    
    try {
      const balance = await web3Service.getTokenBalance(walletAddress);
      setBalance(balance);
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  };

  const refreshTokenInfo = async () => {
    try {
      const info = await web3Service.getTokenInfo();
      setTokenInfo(info);
    } catch (error) {
      console.error('Failed to refresh token info:', error);
    }
  };

  const value: Web3ContextType = {
    isConnected,
    isConnecting,
    walletAddress,
    chainId,
    user,
    isAuthenticated,
    tokenInfo,
    balance,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    refreshTokenInfo,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};