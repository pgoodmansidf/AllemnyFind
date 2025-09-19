import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface WebSocketMessage {
  type: string;
  timestamp: string;
  [key: string]: any;
}

interface JobUpdateData {
  job_id: string;
  job_name?: string;
  stage: string;
  progress: number;
  total_files?: number;
  processed_files?: number;
  current_file?: string;
  error?: string;
}

interface TaskUpdateData {
  task_id: string;
  filename?: string;
  stage: string;
  progress: number;
  document_id?: string;
  chunks_count?: number;
  summary?: string;
  error?: string;
}

interface UseWebSocketProps {
  onJobUpdate?: (data: JobUpdateData) => void;
  onTaskUpdate?: (data: TaskUpdateData) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const useWebSocket = ({
  onJobUpdate,
  onTaskUpdate,
  onConnectionChange,
}: UseWebSocketProps = {}) => {
  const { user } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Track connection state to prevent spam toasts
  const previousConnectionState = useRef<boolean | null>(null);
  const hasShownInitialConnection = useRef(false);

  const connect = useCallback(() => {
    if (!user?.id) return;

    const wsUrl = `ws://localhost:8002/ws/ws/${user.id}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        const newConnectionState = true;
        setIsConnected(newConnectionState);
        reconnectAttempts.current = 0;
        onConnectionChange?.(newConnectionState);

        // Only show initial connection toast once, never show reconnection toasts
        if (!hasShownInitialConnection.current) {
          // Silently connect - don't show any toasts for real-time updates
          hasShownInitialConnection.current = true;
        }
        previousConnectionState.current = newConnectionState;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        const newConnectionState = false;
        setIsConnected(newConnectionState);
        onConnectionChange?.(newConnectionState);

        // Silently handle disconnection - don't show toasts
        previousConnectionState.current = newConnectionState;

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnect attempt ${reconnectAttempts.current}`);
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [user?.id, onConnectionChange]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'connection_established':
        console.log('WebSocket connection established');
        break;

      case 'job_update':
        if (onJobUpdate && message.data) {
          onJobUpdate(message.data as JobUpdateData);
        }
        break;

      case 'task_update':
        if (onTaskUpdate && message.data) {
          onTaskUpdate(message.data as TaskUpdateData);
        }
        break;

      case 'ping':
        // Send pong response
        sendMessage({ type: 'pong' });
        break;

      case 'pong':
        // Handle pong response
        console.log('Received pong from server');
        break;

      case 'error':
        console.error('WebSocket error message:', message.message);
        toast.error(message.message || 'WebSocket error');
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, [onJobUpdate, onTaskUpdate]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    sendMessage({
      type: 'subscribe_job',
      job_id: jobId
    });
  }, [sendMessage]);

  const getJobStatus = useCallback((jobId: string) => {
    sendMessage({
      type: 'get_job_status',
      job_id: jobId
    });
  }, [sendMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    previousConnectionState.current = false;
  }, []);

  // Connect when user is available
  useEffect(() => {
    if (user?.id) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [user?.id, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    subscribeToJob,
    getJobStatus,
    reconnect: connect,
    disconnect,
  };
};