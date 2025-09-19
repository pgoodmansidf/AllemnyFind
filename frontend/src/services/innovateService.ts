// frontend/src/services/innovateService.ts
import { apiClient } from './apiClient';

export interface Suggestion {
  id: number;
  title: string;
  description: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  user_id: number;
  admin_id?: number;
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
  approved_at?: string;
  implemented_at?: string;
  upvotes_count: number;
  downvotes_count: number;
  total_score: number;
  priority: number;
  is_featured: boolean;
  submitter_username?: string;
  submitter_name?: string;
  user_vote?: VoteType;
  comments_count: number;
}

export interface SuggestionCreate {
  title: string;
  description: string;
  category: SuggestionCategory;
}

export interface SuggestionUpdate {
  title?: string;
  description?: string;
  category?: SuggestionCategory;
}

export interface SuggestionAdminUpdate {
  status: SuggestionStatus;
  admin_notes?: string;
  priority?: number;
  is_featured?: boolean;
}

export interface Vote {
  id: number;
  user_id: number;
  suggestion_id: number;
  vote_type: VoteType;
  created_at: string;
}

export interface VoteCreate {
  vote_type: VoteType;
}

export interface Comment {
  id: number;
  suggestion_id: number;
  user_id: number;
  content: string;
  is_admin_response: boolean;
  created_at: string;
  updated_at?: string;
  username?: string;
  full_name?: string;
}

export interface CommentCreate {
  content: string;
}

export interface SuggestionListResponse {
  suggestions: Suggestion[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

export interface SuggestionStats {
  total_suggestions: number;
  pending_suggestions: number;
  approved_suggestions: number;
  implemented_suggestions: number;
  total_votes: number;
  total_comments: number;
  categories_breakdown: Record<string, number>;
  recent_activity_count: number;
}

export enum SuggestionCategory {
  FEATURE = 'FEATURE',
  IMPROVEMENT = 'IMPROVEMENT',
  BUG_FIX = 'BUG_FIX',
  UI_UX = 'UI_UX',
  PERFORMANCE = 'PERFORMANCE',
  INTEGRATION = 'INTEGRATION',
  OTHER = 'OTHER',
}

export enum SuggestionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  IN_PROGRESS = 'IN_PROGRESS',
  IMPLEMENTED = 'IMPLEMENTED',
}

export enum VoteType {
  UPVOTE = 'UPVOTE',
  DOWNVOTE = 'DOWNVOTE',
}

export interface SuggestionFilters {
  page?: number;
  size?: number;
  status?: SuggestionStatus;
  category?: SuggestionCategory;
  sort_by?: 'created_at' | 'total_score' | 'updated_at';
  sort_order?: 'asc' | 'desc';
  search?: string;
  featured_only?: boolean;
}

export const categoryLabels: Record<SuggestionCategory, string> = {
  [SuggestionCategory.FEATURE]: 'New Feature',
  [SuggestionCategory.IMPROVEMENT]: 'Improvement',
  [SuggestionCategory.BUG_FIX]: 'Bug Fix',
  [SuggestionCategory.UI_UX]: 'UI/UX',
  [SuggestionCategory.PERFORMANCE]: 'Performance',
  [SuggestionCategory.INTEGRATION]: 'Integration',
  [SuggestionCategory.OTHER]: 'Other',
};

export const statusLabels: Record<SuggestionStatus, string> = {
  [SuggestionStatus.PENDING]: 'Pending Review',
  [SuggestionStatus.APPROVED]: 'Approved',
  [SuggestionStatus.REJECTED]: 'Rejected',
  [SuggestionStatus.IN_PROGRESS]: 'In Progress',
  [SuggestionStatus.IMPLEMENTED]: 'Implemented',
};

export const getStatusColor = (status: SuggestionStatus): string => {
  switch (status) {
    case SuggestionStatus.PENDING:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case SuggestionStatus.APPROVED:
      return 'bg-green-100 text-green-800 border-green-200';
    case SuggestionStatus.REJECTED:
      return 'bg-red-100 text-red-800 border-red-200';
    case SuggestionStatus.IN_PROGRESS:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case SuggestionStatus.IMPLEMENTED:
      return 'bg-purple-100 text-purple-800 border-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const getCategoryColor = (category: SuggestionCategory): string => {
  switch (category) {
    case SuggestionCategory.FEATURE:
      return 'bg-blue-100 text-blue-800';
    case SuggestionCategory.IMPROVEMENT:
      return 'bg-green-100 text-green-800';
    case SuggestionCategory.BUG_FIX:
      return 'bg-red-100 text-red-800';
    case SuggestionCategory.UI_UX:
      return 'bg-purple-100 text-purple-800';
    case SuggestionCategory.PERFORMANCE:
      return 'bg-orange-100 text-orange-800';
    case SuggestionCategory.INTEGRATION:
      return 'bg-indigo-100 text-indigo-800';
    case SuggestionCategory.OTHER:
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

class InnovateService {
  private baseUrl = '/innovate';

  // Suggestion CRUD operations
  async createSuggestion(suggestion: SuggestionCreate): Promise<Suggestion> {
    const response = await apiClient.post(`${this.baseUrl}/suggestions`, suggestion);
    return response.data;
  }

  async getSuggestions(filters: SuggestionFilters = {}): Promise<SuggestionListResponse> {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get(`${this.baseUrl}/suggestions?${params.toString()}`);
    return response.data;
  }

  async getSuggestion(id: number): Promise<Suggestion> {
    const response = await apiClient.get(`${this.baseUrl}/suggestions/${id}`);
    return response.data;
  }

  async updateSuggestion(id: number, update: SuggestionUpdate): Promise<Suggestion> {
    const response = await apiClient.put(`${this.baseUrl}/suggestions/${id}`, update);
    return response.data;
  }

  async adminUpdateSuggestion(id: number, update: SuggestionAdminUpdate): Promise<Suggestion> {
    const response = await apiClient.put(`${this.baseUrl}/suggestions/${id}/admin`, update);
    return response.data;
  }

  async deleteSuggestion(id: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/suggestions/${id}`);
  }

  async getMySuggestions(): Promise<Suggestion[]> {
    const response = await apiClient.get(`${this.baseUrl}/my-suggestions`);
    return response.data;
  }

  // Voting operations
  async voteSuggestion(suggestionId: number, vote: VoteCreate): Promise<Vote> {
    const response = await apiClient.post(`${this.baseUrl}/suggestions/${suggestionId}/vote`, vote);
    return response.data;
  }

  async removeVote(suggestionId: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/suggestions/${suggestionId}/vote`);
  }

  // Comments operations
  async getComments(suggestionId: number): Promise<Comment[]> {
    const response = await apiClient.get(`${this.baseUrl}/suggestions/${suggestionId}/comments`);
    return response.data;
  }

  async createComment(suggestionId: number, comment: CommentCreate): Promise<Comment> {
    const response = await apiClient.post(`${this.baseUrl}/suggestions/${suggestionId}/comments`, comment);
    return response.data;
  }

  // Statistics
  async getStats(): Promise<SuggestionStats> {
    const response = await apiClient.get(`${this.baseUrl}/stats`);
    return response.data;
  }
}

export const innovateService = new InnovateService();