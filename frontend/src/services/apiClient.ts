// src/services/apiClient.ts - COMPLETE API CLIENT

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

// Get the API URL from environment variables or use default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
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
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          
          // Only redirect if not already on login page
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
            toast.error('Session expired. Please login again.');
          }
        } else if (error.response?.status === 403) {
          toast.error('You do not have permission to perform this action');
        } else if (error.response?.status === 404) {
          // Don't show toast for 404s, let the calling code handle it
          console.error('Resource not found:', error.config?.url);
        } else if (error.response?.status === 500) {
          toast.error('Server error. Please try again later.');
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic request methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    return this.client.get<T>(url, config);
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    return this.client.post<T>(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    return this.client.delete<T>(url, config);
  }

  // Special method for file downloads
  async downloadFile(url: string): Promise<Blob> {
    const response = await this.client.get(url, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Special method for file uploads
  async uploadFile(url: string, file: File, additionalData?: Record<string, any>): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });
    }

    return this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  // Method to set authorization token
  setAuthToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('access_token', token);
  }

  // Method to remove authorization token
  clearAuthToken() {
    delete this.client.defaults.headers.common['Authorization'];
    localStorage.removeItem('access_token');
  }

  // Get the axios instance (for special cases)
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

// Export a singleton instance
export const apiClient = new ApiClient();

// Also export the class for testing or multiple instances
export default ApiClient;