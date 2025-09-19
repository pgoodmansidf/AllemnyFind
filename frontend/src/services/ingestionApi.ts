import axios from 'axios';
import toast from 'react-hot-toast';

export interface CreateIngestionJobRequest {
  name: string;
  description?: string;
  source_path: string;
  source_type: 'local' | 'network_share';
  main_tag: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
}

export interface IngestionJob {
  id: string;
  name: string;
  description?: string;
  source_path: string;
  source_type: string;
  main_tag: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_files: number;
  processed_files: number;
  failed_files: number;
  skipped_files: number;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface DirectoryScanRequest {
  path: string;
  recursive: boolean;
  include_patterns?: string[];
  exclude_patterns?: string[];
  max_files?: number;
}

export interface DirectoryScanResult {
  scan_info: {
    directory: string;
    recursive: boolean;
    scan_duration: number;
    scanned_at: string;
  };
  statistics: Record<string, number>;
  files: FileInfo[];
  total_files: number;
  total_size: number;
  file_types: Record<string, FileTypeStats>;
  success: boolean;
}

export interface FileInfo {
  path: string;
  filename: string;
  extension: string;
  size: number;
  size_formatted: string;
  created_at: string;
  modified_at: string;
  mime_type?: string;
}

export interface FileTypeStats {
  count: number;
  total_size: number;
  total_size_formatted: string;
  percentage: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  is_embedding_model: boolean;
  digest: string;
  family: string;
}

export interface ConnectionStatus {
  ollama: {
    status: 'connected' | 'error';
    ollama_url: string;
    available_models?: number;
    error?: string;
    tested_at: string;
  };
  groq: {
    status: 'connected' | 'error';
    model: string;
    api_key_configured: boolean;
    error?: string;
    tested_at: string;
  };
  overall_status: 'connected' | 'error';
}

export interface JobStatistics {
  job: IngestionJob;
  statistics?: {
    files_per_minute: number;
    average_file_size: number;
    total_processing_time: number;
    error_rate: number;
    throughput_mbps: number;
  };
  document_status_counts: Record<string, number>;
  total_chunks: number;
  success: boolean;
}

export interface ProcessedDocument {
  id: string;
  filename: string;
  original_path: string;
  file_type: string;
  file_size: number;
  mime_type?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'embedding_pending' | 'partially_completed';
  title?: string;
  author?: string;
  summary?: string;
  main_topics?: string[];
  product_tags?: string[];
  ingestion_job_id: string;
  main_tag: string;
  created_at: string;
  processed_at?: string;
  error_message?: string;
}

class IngestionApiService {
  private api = axios.create({
    baseURL: '/api/v1/ingestion',
    timeout: 30000,
  });

  constructor() {
    // Add auth token to requests
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('access_token');
      if (token) {
        // Ensure headers exist before setting Authorization
        config.headers = config.headers || {};
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

  // Directory and file operations
  async scanDirectory(request: DirectoryScanRequest): Promise<DirectoryScanResult> {
    const response = await this.api.post<DirectoryScanResult>('/scan-directory', request);
    return response.data;
  }

  async validatePath(path: string): Promise<any> {
    const formData = new FormData();
    formData.append('path', path);
    const response = await this.api.post('/validate-path', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getDirectoryTree(path: string, maxDepth: number = 3): Promise<any> {
    const response = await this.api.get('/directory-tree', {
      params: { path, max_depth: maxDepth },
    });
    return response.data;
  }

  // Ollama integration
  async getOllamaModels(): Promise<{ models: OllamaModel[]; success: boolean }> {
    const response = await this.api.get<{ models: OllamaModel[]; success: boolean }>('/ollama/models');
    return response.data;
  }

  // Connection testing
  async testConnections(): Promise<ConnectionStatus> {
    const response = await this.api.post<ConnectionStatus>('/test-connections');
    return response.data;
  }

  // Job management
  async createIngestionJob(request: CreateIngestionJobRequest): Promise<IngestionJob> {
    const response = await this.api.post<IngestionJob>('/jobs', request);
    return response.data;
  }

  async getIngestionJobs(
    skip: number = 0,
    limit: number = 50,
    statusFilter?: string
  ): Promise<IngestionJob[]> {
    const response = await this.api.get<IngestionJob[]>('/jobs', {
      params: { skip, limit, status_filter: statusFilter },
    });
    return response.data;
  }

  async getIngestionJob(jobId: string): Promise<IngestionJob> {
    const response = await this.api.get<IngestionJob>(`/jobs/${jobId}`);
    return response.data;
  }

  async deleteIngestionJob(jobId: string, cascade: boolean = true): Promise<void> {
    await this.api.delete(`/jobs/${jobId}`, {
      params: { cascade },
    });
  }

  async getJobStatistics(jobId: string): Promise<JobStatistics> {
    const response = await this.api.get<JobStatistics>(`/jobs/${jobId}/statistics`);
    return response.data;
  }

  // NEW: Start ingestion job
  async startIngestionJob(jobId: string): Promise<void> {
    await this.api.post(`/jobs/${jobId}/start`);
  }

  // NEW: Get processed documents
  async getProcessedDocuments(
    skip: number = 0,
    limit: number = 50,
    jobId?: string,
    statusFilter?: string
  ): Promise<ProcessedDocument[]> {
    const response = await this.api.get<ProcessedDocument[]>('/documents', {
      params: { skip, limit, job_id: jobId, status_filter: statusFilter },
    });
    return response.data;
  }

  async getProcessedDocument(documentId: string): Promise<ProcessedDocument> {
    const response = await this.api.get<ProcessedDocument>(`/documents/${documentId}`);
    return response.data;
  }
}

export const ingestionApi = new IngestionApiService();