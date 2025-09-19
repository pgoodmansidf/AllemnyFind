// src/services/commentsApi.ts
import { apiClient } from './apiClient';

export interface DocumentComment {
  id: string;
  document_id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
  updated_at: string;
  like_count: number;
  is_liked_by_user: boolean;
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

export interface CreateCommentRequest {
  document_id: string;
  text: string;
}

export interface UpdateCommentRequest {
  text: string;
}

export interface CommentsResponse {
  comments: DocumentComment[];
  total_count: number;
}

class CommentsApiService {
  private api = apiClient;

  // Document Comments
  async getDocumentComments(
    documentId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<CommentsResponse> {
    const response = await this.api.get<CommentsResponse>(
      `/documents/${documentId}/comments`,
      {
        params: { limit, offset }
      }
    );
    return response.data;
  }

  async createComment(request: CreateCommentRequest): Promise<DocumentComment> {
    const response = await this.api.post<DocumentComment>(
      `/documents/${request.document_id}/comments`,
      { text: request.text }
    );
    return response.data;
  }

  async updateComment(
    commentId: string,
    request: UpdateCommentRequest
  ): Promise<DocumentComment> {
    const response = await this.api.put<DocumentComment>(
      `/comments/${commentId}`,
      request
    );
    return response.data;
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.api.delete(`/comments/${commentId}`);
  }

  // Comment Likes
  async likeComment(commentId: string): Promise<CommentLike> {
    const response = await this.api.post<CommentLike>(
      `/comments/${commentId}/like`
    );
    return response.data;
  }

  async unlikeComment(commentId: string): Promise<void> {
    await this.api.delete(`/comments/${commentId}/like`);
  }

  async getCommentLikes(commentId: string): Promise<CommentLike[]> {
    const response = await this.api.get<CommentLike[]>(
      `/comments/${commentId}/likes`
    );
    return response.data;
  }
}

export const commentsApi = new CommentsApiService();