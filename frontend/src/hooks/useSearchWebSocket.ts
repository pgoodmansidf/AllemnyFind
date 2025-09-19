import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { StreamChunk } from '@/services/searchApi';
import toast from 'react-hot-toast';

interface UseSearchWebSocketProps {
  onStreamChunk?: (chunk: StreamChunk) => void;
  onSearchComplete?: (processingTime: number) => void;
  onError?: (error: string) => void;
}

export const useSearchWebSocket = ({
  onStreamChunk,
  onSearchComplete,
  onError,
}: UseSearchWebSocketProps = {}) => {
  const { user } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const hasShownConnectedToast = useRef(false); // Prevent repeated toasts

  const connect = useCallback(() => {
    if (!user?.id || wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `ws://localhost:8000/api/v1/search/ws/search/${user.id}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('Search WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        
        // Only show toast once per session
        if (!hasShownConnectedToast.current) {
          toast.success('Search service connected');
          hasShownConnectedToast.current = true;
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data); // Debug log
          
          switch (data.type) {
            case 'search_stream':
              if (onStreamChunk && data.data) {
                onStreamChunk(data.data);
              }
              break;
              
            case 'search_complete':
              setIsSearching(false);
              if (onSearchComplete) {
                onSearchComplete(data.processing_time);
              }
              break;
              
            case 'error':
              setIsSearching(false);
              const errorMsg = data.message || 'Search error occurred';
              if (onError) {
                onError(errorMsg);
              }
              break;
              
            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('Search WebSocket disconnected');
        setIsConnected(false);
        setIsSearching(false);
        wsRef.current = null;
        
        // Only reconnect if we haven't exceeded attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            console.log(`Search WebSocket reconnect attempt ${reconnectAttempts.current}`);
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('Search WebSocket error:', error);
        // Don't immediately close - let onclose handle reconnection
      };

    } catch (error) {
      console.error('Error creating search WebSocket connection:', error);
    }
  }, [user?.id, onStreamChunk, onSearchComplete, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setIsConnected(false);
    setIsSearching(false);
    hasShownConnectedToast.current = false;
  }, []);

  const performSearch = useCallback((query: string, includeOnline: boolean = false) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return false;
    }

    try {
      const searchRequest = {
        query,
        include_online: includeOnline
      };

      wsRef.current.send(JSON.stringify(searchRequest));
      setIsSearching(true);
      return true;
    } catch (error) {
      console.error('Error sending search request:', error);
      toast.error('Failed to send search request');
      return false;
    }
  }, []);

  // Connect when user is available
  useEffect(() => {
    if (user?.id && !wsRef.current) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user?.id, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isSearching,
    performSearch,
    reconnect: connect,
    disconnect,
  };
};