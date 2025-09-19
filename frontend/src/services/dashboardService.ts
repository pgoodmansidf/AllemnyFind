import axios from 'axios';
import toast from 'react-hot-toast';

export interface DashboardStats {
  total_documents: number;
  total_chunks: number;
  active_jobs: number;
  success_rate: number;
  recent_documents: number;
  total_size_mb: number;
}

export interface TagDistribution {
  tag: string;
  count: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
}

export interface RecentActivity {
  filename: string;
  file_type: string;
  created_at: string | null;
  status: string;
}

export interface DashboardMetrics {
  basic_stats: DashboardStats;
  distribution: {
    main_tags: TagDistribution[];
    processing_status: StatusDistribution[];
  };
  recent_activity: RecentActivity[];
  generated_at: string;
}

export interface TopicCloudItem {
  text: string;
  value: number;
  size: number;
  color: string;
  fontWeight: string;
  fontSize: string;
}

export interface UserStats {
  user_documents: number;
  user_searches: number;
  user_summaries: number;
  last_activity: string | null;
}

class DashboardService {
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

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const response = await this.api.get('/metrics/dashboard');
    return response.data;
  }

  async getTopicCloudData(limit: number = 50): Promise<TopicCloudItem[]> {
    const response = await this.api.get('/metrics/topic-cloud', {
      params: { limit }
    });
    return response.data;
  }

  async getUserStats(): Promise<UserStats> {
    const response = await this.api.get('/metrics/user-stats');
    return response.data;
  }
}

export const dashboardService = new DashboardService();