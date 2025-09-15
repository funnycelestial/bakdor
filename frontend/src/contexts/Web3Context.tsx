import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ethers } from 'ethers';
import { apiService, User } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface WalletConnection {
  address: string;
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
  chainId: number;
}

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  totalBurned: string;
  circulatingSupply: string;
  burnRate: number;
}

interface Web3ContextType {
  // Wallet state
  isConnected: boolean;
  isConnecting: boolean;
  isAuthenticating: boolean;
  walletAddress: string | null;
  chainId: number | null;
  walletType: string | null;
  
  // User state
  user: User | null;
  isAuthenticated: boolean;
  authError: string | null;
  
  // Token state
  tokenInfo: TokenInfo | null;
  balance: string;
  
  // Actions
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshBalance: () => Promise<void>;
  refreshTokenInfo: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearAuthError: () => void;
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
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletType, setWalletType] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
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

  const detectWalletType = () => {
    if (typeof window !== 'undefined') {
      if (window.ethereum?.isMetaMask) return 'MetaMask';
      if (window.ethereum?.isCoinbaseWallet) return 'Coinbase Wallet';
      if (window.ethereum?.isBinance) return 'Binance Wallet';
      if (window.ethereum?.isWalletConnect) return 'WalletConnect';
      if (window.ethereum) return 'Unknown Wallet';
    }
    return null;
  };

  const connectToWallet = async (): Promise<WalletConnection> => {
    if (!window.ethereum) {
      throw new Error('No Web3 wallet detected. Please install MetaMask, Coinbase Wallet, or Binance Wallet.');
    }

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      return {
        address,
        provider,
        signer,
        chainId: Number(network.chainId)
      };
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('Wallet connection rejected by user');
      }
      throw new Error(`Wallet connection failed: ${error.message}`);
    }
  };

  const signMessage = async (message: string, signer: ethers.JsonRpcSigner): Promise<string> => {
    try {
      return await signer.signMessage(message);
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('Message signing rejected by user');
      }
      throw new Error(`Message signing failed: ${error.message}`);
    }
  };
  const checkExistingConnection = async () => {
    try {
      setAuthError(null);
      // Check if wallet is already connected
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const connection = await connectToWallet();
          setWalletAddress(connection.address);
          setChainId(connection.chainId);
          setWalletType(detectWalletType());
          setIsConnected(true);
          
          // Check for existing auth token
          const token = apiService.getAuthToken();
          if (token) {
            try {
              setIsAuthenticating(true);
              await authenticateUser(connection.address, connection.signer);
            } catch (error) {
              console.error('Failed to authenticate with existing token:', error);
              apiService.clearAuthToken();
              setAuthError('Session expired. Please reconnect your wallet.');
            } finally {
              setIsAuthenticating(false);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing connection:', error);
      setAuthError('Failed to check wallet connection');
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else if (accounts[0] !== walletAddress) {
      // Account changed, reconnect
      setAuthError(null);
      connectWallet();
    }
  };

  const handleChainChanged = (chainId: string) => {
    setChainId(parseInt(chainId, 16));
    toast.info('Network changed. Please refresh if you experience issues.');
  };

  const authenticateUser = async (address: string, signer: ethers.JsonRpcSigner) => {
    try {
      setAuthError(null);
      // Step 1: Get nonce for signing
      const nonceResponse = await apiService.login(address);
      
      if (nonceResponse.step === 'sign') {
        // Need to sign the message
        const signature = await signMessage(nonceResponse.message, signer);
        
        // Step 2: Send signature for verification
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
          
          toast.success(`Welcome back, ${authResponse.user.anonymousId}!`);
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
      setAuthError(error.message || 'Authentication failed');
      throw error;
    }
  };

  const connectWallet = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    setAuthError(null);
    
    try {
      // Connect wallet
      const connection = await connectToWallet();
      setWalletAddress(connection.address);
      setChainId(connection.chainId);
      setWalletType(detectWalletType());
      setIsConnected(true);
      
      toast.success(`${detectWalletType()} connected successfully`);
      
      // Authenticate with backend
      setIsAuthenticating(true);
      await authenticateUser(connection.address);
      
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      const errorMessage = error.message || 'Failed to connect wallet';
      setAuthError(errorMessage);
      toast.error(errorMessage);
      setIsConnected(false);
      setWalletAddress(null);
      setChainId(null);
      setWalletType(null);
    } finally {
      setIsConnecting(false);
      setIsAuthenticating(false);
    }
  };

  const disconnectWallet = () => {
    apiService.clearAuthToken();
    apiService.disconnectSocket();
    setIsConnected(false);
    setWalletAddress(null);
    setChainId(null);
    setWalletType(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setTokenInfo(null);
    setBalance('0');
    toast.info('Wallet disconnected');
  };

  const clearAuthError = () => {
    setAuthError(null);
  };
  const refreshBalance = async () => {
    if (!walletAddress || !isAuthenticated) return;
    
    try {
      // Get balance from backend (which syncs with blockchain)
      const response = await apiService.refreshBalance();
      setBalance(response.data.balance.available.toString());
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      toast.error('Failed to refresh balance');
    }
  };

  const refreshTokenInfo = async () => {
    try {
      const response = await apiService.getTokenInfo();
      setTokenInfo(response.data.token);
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
    isAuthenticating,
    walletAddress,
    chainId,
    walletType,
    user,
    isAuthenticated,
    authError,
    tokenInfo,
    balance,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    refreshTokenInfo,
    refreshUser,
    clearAuthError,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};