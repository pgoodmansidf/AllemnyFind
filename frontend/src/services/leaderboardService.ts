// src/services/leaderboardService.ts
import { apiClient } from './apiClient';

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  full_name?: string;
  department?: string;
  total_score: number;
  contributions_count: number;
  likes_received: number;
  searches_count: number;
  documents_starred: number;
  documents_uploaded: number;
  join_date: string;
  last_activity?: string;
}

export interface LeaderboardStats {
  total_users: number;
  total_contributions: number;
  total_likes: number;
  total_searches: number;
  most_active_department?: string;
  top_contributor?: string;
}

export interface UserRankDetails {
  user: LeaderboardEntry;
  rank_breakdown: {
    contributions: { count: number; points: number };
    likes_received: { count: number; points: number };
    searches: { count: number; points: number };
    stars: { count: number; points: number };
    uploads: { count: number; points: number };
  };
  recent_activity: Array<{
    type: string;
    description: string;
    timestamp: string;
    points: number;
  }>;
}

export type LeaderboardPeriod = 'all' | 'month' | 'week';

class LeaderboardService {
  private readonly basePath = '/leaderboard';

  async getLeaderboard(
    period: LeaderboardPeriod = 'all',
    department?: string,
    limit: number = 50
  ): Promise<LeaderboardEntry[]> {
    const params = new URLSearchParams({
      period,
      limit: limit.toString(),
    });

    if (department) {
      params.append('department', department);
    }

    const response = await apiClient.get<LeaderboardEntry[]>(
      `${this.basePath}/?${params.toString()}`
    );
    return response.data;
  }

  async getLeaderboardStats(): Promise<LeaderboardStats> {
    const response = await apiClient.get<LeaderboardStats>(
      `${this.basePath}/stats`
    );
    return response.data;
  }

  async getUserRankDetails(userId: number): Promise<UserRankDetails> {
    const response = await apiClient.get<UserRankDetails>(
      `${this.basePath}/user/${userId}`
    );
    return response.data;
  }

  async getMyRank(): Promise<UserRankDetails> {
    const response = await apiClient.get<UserRankDetails>(
      `${this.basePath}/my-rank`
    );
    return response.data;
  }

  async getDepartments(): Promise<string[]> {
    const response = await apiClient.get<string[]>(
      `${this.basePath}/departments`
    );
    return response.data;
  }
}

export const leaderboardService = new LeaderboardService();