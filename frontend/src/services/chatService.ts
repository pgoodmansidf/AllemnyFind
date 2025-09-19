/**
 * Chat Service for Allemny Chat API
 * Handles real-time streaming chat with document retrieval
 */

import { apiService } from './api';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
}

export interface Citation {
  filename: string;
  title?: string;
  page_number?: number;
  main_tag?: string;
  similarity: number;
  chunk_id: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  total_messages: number;
}

export interface ConversationHistory {
  conversation_id: string;
  messages: ChatMessage[];
}

export interface ChatStreamEvent {
  type: 'init' | 'status' | 'content' | 'citations' | 'done' | 'error';
  conversation_id?: string;
  message?: string;
  content?: string;
  citations?: Citation[];
}

export interface ChatStats {
  total_conversations: number;
  total_messages: number;
  last_activity?: string;
  recent_activity: Array<{
    date: string;
    messages: number;
  }>;
}

class ChatService {
  private baseUrl = '/chat';

  /**
   * Create a new conversation
   */
  async createConversation(title?: string): Promise<Conversation> {
    const response = await apiService.post(`${this.baseUrl}/conversations`, {
      title
    });

    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }

    return response.data;
  }

  /**
   * Get user's conversation list
   */
  async getConversations(): Promise<Conversation[]> {
    const response = await apiService.get(`${this.baseUrl}/conversations`);

    if (!response.ok) {
      throw new Error('Failed to fetch conversations');
    }

    return response.data.conversations;
  }

  /**
   * Get conversation message history
   */
  async getConversationHistory(conversationId: string, limit = 20): Promise<ConversationHistory> {
    const response = await apiService.get(
      `${this.baseUrl}/conversations/${conversationId}/history?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch conversation history');
    }

    return response.data;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const response = await apiService.delete(`${this.baseUrl}/conversations/${conversationId}`);

    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
  }

  /**
   * Send a chat message and get streaming response
   */
  async *sendMessage(
    message: string,
    conversationId?: string
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/v1/chat/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationId
        })
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Chat functionality is restricted to administrators');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                yield data as ChatStreamEvent;
              } catch (e) {
                // Skip malformed SSE data
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get chat usage statistics
   */
  async getStats(): Promise<ChatStats> {
    const response = await apiService.get(`${this.baseUrl}/stats`);

    if (!response.ok) {
      throw new Error('Failed to fetch chat statistics');
    }

    return response.data;
  }

  /**
   * Check chat service health
   */
  async checkHealth(): Promise<{
    status: string;
    components: Record<string, string>;
    timestamp: string;
  }> {
    const response = await apiService.get(`${this.baseUrl}/health`);

    if (!response.ok) {
      throw new Error('Failed to check chat health');
    }

    return response.data;
  }

  /**
   * Format message for display
   */
  formatMessage(message: ChatMessage): ChatMessage {
    return {
      ...message,
      content: message.content.trim(),
      timestamp: new Date(message.timestamp).toISOString()
    };
  }

  /**
   * Extract key topics from citations
   */
  extractTopics(citations: Citation[]): string[] {
    const topics = new Set<string>();

    citations.forEach(citation => {
      if (citation.main_tag) {
        topics.add(citation.main_tag);
      }
    });

    return Array.from(topics);
  }

  /**
   * Generate conversation title from first message
   */
  generateTitle(firstMessage: string): string {
    // Take first 50 characters and find the last complete word
    let title = firstMessage.slice(0, 50);
    const lastSpaceIndex = title.lastIndexOf(' ');

    if (lastSpaceIndex > 20) {
      title = title.slice(0, lastSpaceIndex);
    }

    return title + (firstMessage.length > 50 ? '...' : '');
  }

  /**
   * Check if user has chat access
   */
  async hasAccess(): Promise<boolean> {
    try {
      const response = await this.checkHealth();
      return response.status !== 'unauthorized';
    } catch (error) {
      if (error instanceof Error && error.message.includes('403')) {
        return false;
      }
      // Other errors might be temporary, assume access is available
      return true;
    }
  }
}

// Export singleton instance
export const chatService = new ChatService();