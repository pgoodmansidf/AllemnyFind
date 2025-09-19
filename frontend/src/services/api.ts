import axios, { AxiosInstance, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  full_name?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  department?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

class ApiService {
  public api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: '/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

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
      (response: AxiosResponse) => response,
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

  // Auth endpoints
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await this.api.post<TokenResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async register(userData: RegisterRequest): Promise<User> {
    const formData = new FormData();
    formData.append('username', userData.username);
    formData.append('password', userData.password);
    if (userData.email) formData.append('email', userData.email);
    if (userData.full_name) formData.append('full_name', userData.full_name);

    const response = await this.api.post<User>('/auth/register', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.api.get<User>('/auth/me');
    return response.data;
  }

  async logout(): Promise<void> {
    await this.api.post('/auth/logout');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  }

  // Generic HTTP methods for other services
  get = async (url: string): Promise<{ ok: boolean; data: any; status: number }> => {
    try {
      const response = await this.api.get(url);
      return {
        ok: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        ok: false,
        data: error.response?.data || null,
        status: error.response?.status || 0
      };
    }
  }

  post = async (url: string, data?: any): Promise<{ ok: boolean; data: any; status: number }> => {
    try {
      const response = await this.api.post(url, data);
      return {
        ok: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        ok: false,
        data: error.response?.data || null,
        status: error.response?.status || 0
      };
    }
  }

  put = async (url: string, data?: any): Promise<{ ok: boolean; data: any; status: number }> => {
    try {
      const response = await this.api.put(url, data);
      return {
        ok: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        ok: false,
        data: error.response?.data || null,
        status: error.response?.status || 0
      };
    }
  }

  delete = async (url: string): Promise<{ ok: boolean; data: any; status: number }> => {
    try {
      const response = await this.api.delete(url);
      return {
        ok: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        ok: false,
        data: error.response?.data || null,
        status: error.response?.status || 0
      };
    }
  }

  // Health check
  async healthCheck(): Promise<any> {
    const response = await axios.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();