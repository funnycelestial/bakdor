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
  refreshUser: () => Promise<void>;
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
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  const checkExistingConnection = async () => {
    try {
      // Check if wallet is already connected
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
              await authenticateUser(connection.address);
            } catch (error) {
              console.error('Failed to authenticate with existing token:', error);
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
    toast.info('Network changed. Please refresh if you experience issues.');
  };

  const authenticateUser = async (address: string) => {
    try {
      // First, try to get nonce for signing
      const nonceResponse = await apiService.login(address);
      
      if (nonceResponse.step === 'sign') {
        // Need to sign the message
        const signature = await web3Service.signMessage(nonceResponse.message);
        
        // Send signature for verification
        const authResponse = await apiService.login(address, signature);
        
        if (authResponse.step === 'verified') {
          setUser(authResponse.user);
          setIsAuthenticated(true);
          apiService.setAuthToken(authResponse.token);
          
          // Connect WebSocket
          apiService.connectSocket(authResponse.token);
          
          // Load initial data
          await Promise.all([
            refreshBalance(),
            refreshTokenInfo()
          ]);
          
          toast.success(`Welcome, ${authResponse.user.anonymousId}!`);
          return authResponse.user;
        }
      } else if (nonceResponse.user) {
        // Already authenticated
        setUser(nonceResponse.user);
        setIsAuthenticated(true);
        apiService.setAuthToken(nonceResponse.token);
        
        // Connect WebSocket
        apiService.connectSocket(nonceResponse.token);
        
        await Promise.all([
          refreshBalance(),
          refreshTokenInfo()
        ]);
        
        return nonceResponse.user;
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
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
      
      // Authenticate with backend
      await authenticateUser(connection.address);
      
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
    if (!walletAddress || !isAuthenticated) return;
    
    try {
      // Get balance from backend (which syncs with blockchain)
      const response = await apiService.refreshBalance();
      setBalance(response.balance.available.toString());
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      // Fallback to direct blockchain call
      try {
        const blockchainBalance = await web3Service.getTokenBalance(walletAddress);
        setBalance(blockchainBalance);
      } catch (blockchainError) {
        console.error('Failed to get blockchain balance:', error);
      }
    }
  };

  const refreshTokenInfo = async () => {
    try {
      const info = await web3Service.getTokenInfo();
      setTokenInfo(info);
    } catch (error) {
      console.error('Failed to refresh token info:', error);
      // Use mock data as fallback
      setTokenInfo({
        name: 'WikiCat Token',
        symbol: 'WKC',
        decimals: 18,
        totalSupply: '1000000000',
        totalBurned: '125000',
        circulatingSupply: '874875000',
        burnRate: 2.34
      });
    }
  };

  const refreshUser = async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await apiService.getProfile();
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to refresh user:', error);
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
    refreshUser,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};