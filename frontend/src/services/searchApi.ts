// searchApi.ts

import axios, { AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export interface Comment {
  id: string;
  text: string;
  timestamp: string;
  userId?: string;
}

export interface SearchRequest {
  query: string;
  include_online: boolean;
  session_id?: string;
  filters?: any;
  selected_product?: string;  // Add this field
}

export interface SearchResponse {
  id: string;
  query: string;
  response: string;
  citations_count: number;
  processing_time: number;
  include_online: boolean;
  success: boolean;
  timestamp: string;
  comments?: Comment[];
  document_groups?: Record<string, any[]>;
  metadata?: any;  // Add metadata field
}

export interface SearchHistoryResponse {
  searches: SearchResponse[];
  total_count: number;
  session_info?: Record<string, any>;
}

export interface SearchSuggestion {
  suggestions: string[];
  query: string;
}

export interface AgentStatus {
  search_agent: string;
  specialist_agent?: string;
  formatter_agent?: string;
  knowledge_base: string;
  vector_db: string;
  protocol?: string;
  transport?: string;
  timestamp: string;
}

export interface StreamChunk {
  type: 'search_started' | 'stage_update' | 'content_chunk' | 'content_complete' | 
        'search_complete' | 'error' | 'document_groups' | 'single_result' | 
        'multiple_results' | 'no_results';  // Add new types
  content?: string;
  message?: string;
  timestamp?: string;
  stage?: string;
  processing_time?: number;
  citations?: any[];
  groups?: Record<string, any[]>; // For document_groups type
  document_groups?: Record<string, any[]>; // For search_complete type
  data?: any; // For single_result
  products?: any[]; // For multiple_results
  metadata?: any; // For additional metadata
}

export interface TestConnectionResponse {
  agentic_service: 'connected' | 'disconnected' | 'error';
  agent_status: AgentStatus;
}

class SearchApiService {
  private api = axios.create({
    baseURL: '/api/v1/search',
    timeout: 60000, // 60 seconds for search operations
  });

  constructor() {
    // Add auth token to requests
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.data?.detail) {
          toast.error(error.response.data.detail);
        } else if (error.message) {
          toast.error(error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  // Stream search with SSE - Updated to handle selected_product
  async streamSearch(
    params: {
      query: string;
      include_online?: boolean;
      filters?: any;
      selected_product?: string;  // Add this parameter
    },
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch('/api/v1/search/search/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        query: params.query,
        include_online: params.include_online || false,
        filters: params.filters || {},
        selected_product: params.selected_product || null  // Include in request body
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onChunk(data);
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Regular search (non-streaming) - Updated to handle selected_product
  async performSearch(request: SearchRequest): Promise<SearchResponse> {
    const response = await this.api.post<SearchResponse>('/', request);
    return response.data;
  }

  // Search with specific product selection
  async searchWithProduct(query: string, product: string): Promise<void> {
    // This method is called from the UI but the actual implementation
    // should use streamSearch with selected_product parameter
    // The calling component should handle this appropriately
    console.log(`Searching for product: ${product} with query: ${query}`);
  }

  async getSearchHistory(
    limit: number = 20, 
    offset: number = 0, 
    sessionId?: string
  ): Promise<SearchHistoryResponse> {
    const response = await this.api.get<SearchHistoryResponse>('/history', {
      params: { limit, offset, session_id: sessionId }
    });
    return response.data;
  }

  async deleteSearch(searchId: string): Promise<void> {
    await this.api.delete(`/history/${searchId}`);
  }

  async getSearchSuggestions(partialQuery: string): Promise<SearchSuggestion> {
    const response = await this.api.post<SearchSuggestion>('/suggestions', {
      partial_query: partialQuery
    });
    return response.data;
  }

  async getAgentStatus(): Promise<AgentStatus> {
    const response = await this.api.get<AgentStatus>('/agent-status');
    return response.data;
  }

  async testConnection(): Promise<TestConnectionResponse> { 
    const response = await this.api.post<TestConnectionResponse>('/test-connection');
    return response.data;
  }

  // Comment-related methods
  async addComment(searchId: string, comment: string): Promise<Comment> {
    const response = await this.api.post<Comment>(`/history/${searchId}/comments`, {
      text: comment
    });
    return response.data;
  }

  async getComments(searchId: string): Promise<Comment[]> {
    const response = await this.api.get<Comment[]>(`/history/${searchId}/comments`);
    return response.data;
  }

  async deleteComment(searchId: string, commentId: string): Promise<void> {
    await this.api.delete(`/history/${searchId}/comments/${commentId}`);
  }

  // Update search with comments
  async updateSearchWithComments(searchId: string, comments: Comment[]): Promise<SearchResponse> {
    const response = await this.api.patch<SearchResponse>(`/history/${searchId}`, {
      comments
    });
    return response.data;
  }

  // Download document method
  async downloadDocument(documentId: string): Promise<Blob> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`/api/v1/ingestion/documents/${documentId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Download failed');
    }
    
    return response.blob();
  }

  /**
   * Delete a product tag from the backend. This function is used by
   * admin users in the UI to remove a product from the taxonomy.
   *
   * @param product The product tag to delete
   */
  async deleteProductTag(product: string): Promise<void> {
    try {
      // The API expects the product tag to be URL-encoded
      await this.api.delete(`/tags/product/${encodeURIComponent(product)}`);
    } catch (error: any) {
      // Surface a helpful toast message if possible, then rethrow
      const msg = error?.response?.data?.detail || error?.message || 'Failed to delete product tag';
      toast.error(msg);
      throw error;
    }
  }
}

export const searchApi = new SearchApiService();