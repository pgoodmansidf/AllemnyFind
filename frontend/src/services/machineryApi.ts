// src/services/machineryApi.ts
import { apiClient } from './apiClient';

export interface MachinerySearchParams {
  query: string;
  filters?: {
    sector?: string;
    manufacturer?: string;
    min_cost?: number;
    max_cost?: number;
  };
  limit?: number;
  offset?: number;
}

export interface MachinerySpecRequest {
  machinery_id: string;
  description: string;
  manufacturer?: string;
}

export interface MachineryListParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export interface ComparisonRequest {
  machinery_items: Array<{
    id: string;
    description: string;
    manufacturer?: string | null;
    origin?: string | null;
    cost?: number | null;
    sector?: string | null;
    production_year?: number | null;
  }>;
}

export const machineryApi = {
  search: async (params: MachinerySearchParams) => {
    const response = await apiClient.post('/machinery/machinery_search', params);
    return response.data;
  },

  getSpecifications: async (params: MachinerySpecRequest) => {
    const response = await apiClient.post('/machinery/specifications', params);
    return response.data;
  },

  compareEquipment: async (params: ComparisonRequest) => {
    const response = await apiClient.post('/machinery/compare', params);
    return response.data;
  },

  // Note: Streaming comparison is handled directly in the component
  // because it needs special SSE handling

  uploadCSV: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/machinery/admin/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  listMachinery: async (params: MachineryListParams) => {
    const response = await apiClient.get('/machinery/admin/list', { params });
    return response.data;
  },

  exportCSV: async () => {
    const response = await apiClient.get('/machinery/admin/export', {
      responseType: 'blob',
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `machinery_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  clearTable: async () => {
    const response = await apiClient.delete('/machinery/admin/clear');
    return response.data;
  },
};