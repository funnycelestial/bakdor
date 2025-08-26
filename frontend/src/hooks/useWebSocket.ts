import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { isAuthenticated } = useWeb3();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = options.reconnectAttempts || 5;
  const reconnectDelay = options.reconnectDelay || 1000;

  useEffect(() => {
    if (isAuthenticated && options.autoConnect !== false) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated]);

  const connect = () => {
    if (socketRef.current?.connected) return;

    const token = apiService.getAuthToken();
    if (!token) {
      setConnectionError('No authentication token available');
      return;
    }

    try {
      socketRef.current = apiService.connectSocket(token);
      
      if (socketRef.current) {
        socketRef.current.on('connect', () => {
          setIsConnected(true);
          setConnectionError(null);
          reconnectAttemptsRef.current = 0;
        });

        socketRef.current.on('disconnect', (reason) => {
          setIsConnected(false);
          
          if (reason === 'io server disconnect') {
            // Server disconnected, try to reconnect
            attemptReconnect();
          }
        });

        socketRef.current.on('connect_error', (error) => {
          setConnectionError(error.message);
          attemptReconnect();
        });
      }
    } catch (error: any) {
      setConnectionError(error.message);
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setConnectionError(null);
  };

  const attemptReconnect = () => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setConnectionError('Maximum reconnection attempts reached');
      return;
    }

    reconnectAttemptsRef.current++;
    
    setTimeout(() => {
      if (!socketRef.current?.connected && isAuthenticated) {
        connect();
      }
    }, reconnectDelay * reconnectAttemptsRef.current);
  };

  const emit = (event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  const joinRoom = (room: string) => {
    emit('join_room', { room });
  };

  const leaveRoom = (room: string) => {
    emit('leave_room', { room });
  };

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
    socket: socketRef.current
  };
}