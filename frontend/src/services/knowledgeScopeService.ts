import axios from 'axios';
import toast from 'react-hot-toast';

export interface DocumentTypeDistribution {
  file_type: string;
  count: number;
  percentage: number;
  total_size_mb: number;
}

export interface TemporalCoverage {
  date: string;
  document_count: number;
  cumulative_count: number;
}

export interface TopicCoverage {
  topic: string;
  count: number;
  documents: string[];
  related_topics: string[];
  confidence_score: number;
}

export interface EntityAnalytics {
  entity_type: string;
  entity_name: string;
  count: number;
  documents: string[];
  context_samples?: string[];
}

export interface SearchMetrics {
  total_searches: number;
  unique_users: number;
  average_response_time_ms: number;
  success_rate: number;
  top_keywords: Array<{ keyword: string; count: number }>;
  failed_searches: Array<{ query: string; attempts: number }>;
}

export interface DocumentAccessMetrics {
  document_id: string;
  filename: string;
  access_count: number;
  last_accessed?: string;
  average_view_duration_seconds?: number;
  user_ratings?: number;
}

export interface ContentDepthMetrics {
  average_document_length: number;
  median_document_length: number;
  complexity_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  readability_scores: Record<string, number>;
  total_unique_terms: number;
  vocabulary_richness: number;
}

export interface KnowledgeGap {
  gap_type: string;
  description: string;
  severity: string;
  affected_areas: string[];
  recommended_action: string;
  priority_score: number;
}

export interface QualityMetrics {
  validation_scores: Record<string, number>;
  extraction_accuracy: number;
  duplicate_count: number;
  duplicate_percentage: number;
  error_rate: number;
  processing_success_rate: number;
}

export interface VolumeMetrics {
  total_documents: number;
  total_chunks: number;
  total_size_gb: number;
  storage_utilization_percentage: number;
  average_file_size_mb: number;
  largest_file: Record<string, any>;
  smallest_file: Record<string, any>;
}

export interface CoverageMetrics {
  topic_breadth: number;
  unique_topics: string[];
  temporal_range_days: number;
  earliest_document_date?: string;
  latest_document_date?: string;
  entity_diversity_score: number;
  geographic_coverage: string[];
}

export interface PerformanceMetrics {
  average_search_latency_ms: number;
  p95_search_latency_ms: number;
  p99_search_latency_ms: number;
  search_throughput_qps: number;
  cache_hit_rate: number;
}

export interface KnowledgeScopeData {
  document_coverage: DocumentTypeDistribution[];
  temporal_coverage: TemporalCoverage[];
  topic_coverage: TopicCoverage[];
  entity_analytics: EntityAnalytics[];
  search_metrics: SearchMetrics;
  document_access: DocumentAccessMetrics[];
  content_depth: ContentDepthMetrics;
  knowledge_gaps: KnowledgeGap[];
  quality_metrics: QualityMetrics;
  volume_metrics: VolumeMetrics;
  coverage_metrics: CoverageMetrics;
  performance_metrics: PerformanceMetrics;
  generated_at: string;
  user_role: string;
}

class KnowledgeScopeService {
  private api = axios.create({
    baseURL: '/api/v1',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          toast.error('Session expired. Please login again.');
        } else if (error.response?.data?.detail) {
          toast.error(error.response.data.detail);
        } else if (error.message) {
          toast.error(error.message);
        } else {
          toast.error('An unexpected error occurred');
        }
        return Promise.reject(error);
      }
    );
  }

  async getCompleteAnalytics(): Promise<KnowledgeScopeData> {
    const response = await this.api.get('/knowledgescope/analytics/complete');
    return response.data;
  }

  async getDocumentCoverage(): Promise<DocumentTypeDistribution[]> {
    const response = await this.api.get('/knowledgescope/analytics/document-coverage');
    return response.data;
  }

  async getTemporalCoverage(days: number = 30): Promise<TemporalCoverage[]> {
    const response = await this.api.get('/knowledgescope/analytics/temporal-coverage', {
      params: { days }
    });
    return response.data;
  }

  async getTopicCoverage(limit: number = 50): Promise<TopicCoverage[]> {
    const response = await this.api.get('/knowledgescope/analytics/topic-coverage', {
      params: { limit }
    });
    return response.data;
  }

  async getEntityAnalytics(entityType?: string): Promise<EntityAnalytics[]> {
    const response = await this.api.get('/knowledgescope/analytics/entities', {
      params: { entity_type: entityType }
    });
    return response.data;
  }

  async getSearchMetrics(): Promise<SearchMetrics> {
    const response = await this.api.get('/knowledgescope/analytics/search-metrics');
    return response.data;
  }

  async getContentDepth(): Promise<ContentDepthMetrics> {
    const response = await this.api.get('/knowledgescope/analytics/content-depth');
    return response.data;
  }

  async getKnowledgeGaps(): Promise<KnowledgeGap[]> {
    const response = await this.api.get('/knowledgescope/analytics/knowledge-gaps');
    return response.data;
  }

  async getQualityMetrics(): Promise<QualityMetrics> {
    const response = await this.api.get('/knowledgescope/analytics/quality');
    return response.data;
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const response = await this.api.get('/knowledgescope/analytics/performance');
    return response.data;
  }
}

export const knowledgeScopeService = new KnowledgeScopeService();