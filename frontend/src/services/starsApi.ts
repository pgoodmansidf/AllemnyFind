// src/services/starsApi.ts - COMPLETE STARS API SERVICE

import { apiClient } from './apiClient';

export interface StarredDocument {
  id: string;
  document_id: string;
  filename: string;
  title?: string;
  starred_at: string;
  search_query?: string;
  file_type: string;
  summary?: string;
}

export interface Contribution {
  id: string;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
  updated_at?: string;
  is_edited: boolean;
  like_count: number;
  user_liked: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

class StarsApi {
  // Document Stars
  async starDocument(documentId: string, searchQuery?: string): Promise<{ message: string; star_id: string }> {
    const response = await apiClient.post('/stars/documents/star', {
      document_id: documentId,
      search_query: searchQuery
    });
    return response.data;
  }

  async unstarDocument(documentId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/stars/documents/star/${documentId}`);
    return response.data;
  }

  async getStarredDocuments(): Promise<StarredDocument[]> {
    const response = await apiClient.get('/stars/documents/starred');
    return response.data;
  }

  async getDocumentStarStatus(documentId: string): Promise<{ is_starred: boolean }> {
    try {
      const response = await apiClient.get(`/stars/documents/${documentId}/star-status`);
      return response.data;
    } catch (error) {
      // If there's an error (like 404), assume it's not starred
      return { is_starred: false };
    }
  }

  // Search Stars
  async starSearch(searchId: string): Promise<{ message: string; star_id: string }> {
    const response = await apiClient.post('/stars/searches/star', {
      search_id: searchId
    });
    return response.data;
  }

  async unstarSearch(searchId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/stars/searches/star/${searchId}`);
    return response.data;
  }

  async getSearchStarStatus(searchId: string): Promise<{ is_starred: boolean }> {
    try {
      const response = await apiClient.get(`/stars/searches/${searchId}/star-status`);
      return response.data;
    } catch (error) {
      // If there's an error (like 404), assume it's not starred
      return { is_starred: false };
    }
  }

  // Document Contributions
  async createContribution(documentId: string, content: string): Promise<Contribution> {
    const response = await apiClient.post('/stars/contributions', {
      document_id: documentId,
      content
    });
    return response.data;
  }

  async getDocumentContributions(documentId: string): Promise<Contribution[]> {
    try {
      const response = await apiClient.get(`/stars/documents/${documentId}/contributions`);
      return response.data;
    } catch (error) {
      console.error('Error fetching contributions:', error);
      return [];
    }
  }

  async updateContribution(contributionId: string, content: string): Promise<Contribution> {
    const response = await apiClient.put(`/stars/contributions/${contributionId}`, {
      content
    });
    return response.data;
  }

  async deleteContribution(contributionId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/stars/contributions/${contributionId}`);
    return response.data;
  }

  async likeContribution(contributionId: string): Promise<{ message: string; like_count: number }> {
    const response = await apiClient.post(`/stars/contributions/${contributionId}/like`);
    return response.data;
  }

  async unlikeContribution(contributionId: string): Promise<{ message: string; like_count: number }> {
    const response = await apiClient.delete(`/stars/contributions/${contributionId}/like`);
    return response.data;
  }
}

// Export singleton instance
export const starsApi = new StarsApi();