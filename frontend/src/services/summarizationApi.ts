import axios from 'axios';
import type { AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export interface SummarizationRequest {
  document_ids: string[];
  summary_type: 'general' | 'executive' | 'research_brief';
  topic?: string;
}

export interface SummaryResponse {
  id: string;
  title: string;
  summary_type: string;
  document_count: number;
  word_count: number;
  is_starred: boolean;
  created_at: string;
  processing_time: number;
  topics: string[];
  tags: string[];
}

export interface DetailedSummaryResponse extends SummaryResponse {
  executive_summary?: string;
  key_findings?: string[];
  trends?: any[];
  statistics?: any[];
  conclusions?: string;
  recommendations?: string[];
  full_summary: string;
  citations?: any[];
  source_documents?: any[];
}

export interface AvailableDocument {
  id: string;
  filename: string;
  title: string;
  file_size: number;
  main_tag: string;
  product_tags: string[];
  creation_date?: string;
  modification_date?: string;
  chunk_count: number;
}

export interface SummaryStreamChunk {
  type: 'stage_update' | 'content_chunk' | 'summary_complete' | 'error';
  stage?: string;
  message?: string;
  content?: string;
  summary_id?: string;
  processing_time?: number;
  statistics?: any[];
  document_count?: number;
  word_count?: number;
  timestamp?: string;
}

class SummarizationApiService {
  private api = axios.create({
    baseURL: '/api/v1/summarization',
    timeout: 120000, // 2 minutes for summarization
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
        if (error.response?.status === 401) {
          window.location.href = '/login';
        } else if (error.response?.data?.detail) {
          toast.error(error.response.data.detail);
        }
        return Promise.reject(error);
      }
    );
  }

  // Stream summarization with SSE
  async streamSummarization(
    params: SummarizationRequest,
    onChunk: (chunk: SummaryStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch('/api/v1/summarization/create/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        document_ids: params.document_ids,
        summary_type: params.summary_type,
        topic: params.topic
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

  // Get summary history
  async getSummaryHistory(
    limit: number = 20,
    offset: number = 0,
    summaryType?: string,
    starredOnly: boolean = false
  ): Promise<SummaryResponse[]> {
    const response = await this.api.get<SummaryResponse[]>('/history', {
      params: {
        limit,
        offset,
        summary_type: summaryType,
        starred_only: starredOnly
      }
    });
    return response.data;
  }

  // Get specific summary
  async getSummary(summaryId: string): Promise<DetailedSummaryResponse> {
    const response = await this.api.get<DetailedSummaryResponse>(`/${summaryId}`);
    return response.data;
  }

  // Toggle star status
  async toggleStar(summaryId: string): Promise<boolean> {
    const response = await this.api.post<{ is_starred: boolean }>(`/${summaryId}/star`);
    return response.data.is_starred;
  }

  // Delete summary
  async deleteSummary(summaryId: string): Promise<void> {
    await this.api.delete(`/${summaryId}`);
  }

  // Get available documents
  async getAvailableDocuments(): Promise<AvailableDocument[]> {
    const response = await this.api.get<AvailableDocument[]>('/documents/available');
    return response.data;
  }
}

export const summarizationApi = new SummarizationApiService();