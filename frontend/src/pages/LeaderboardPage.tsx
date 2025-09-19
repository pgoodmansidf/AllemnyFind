import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy, Medal, Award, Users, TrendingUp, Star, Search,
  Upload, MessageSquare, Heart, Calendar, Filter, Crown,
  ChevronUp, ChevronDown, Activity, Target
} from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import {
  leaderboardService,
  LeaderboardEntry,
  LeaderboardStats,
  UserRankDetails,
  LeaderboardPeriod
} from '@/services/leaderboardService';
import toast from 'react-hot-toast';

export const LeaderboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [myRank, setMyRank] = useState<UserRankDetails | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  // Add ref to prevent duplicate API calls and error messages
  const isLoadingRef = React.useRef(false);
  const lastErrorRef = React.useRef<number>(0);

  useEffect(() => {
    // Only load if not already loading
    if (!isLoadingRef.current) {
      loadLeaderboardData();
    }
  }, [period, selectedDepartment]);

  const loadLeaderboardData = async () => {
    // Prevent duplicate calls
    if (isLoadingRef.current) {
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      const [leaderboardData, statsData, myRankData, departmentsData] = await Promise.all([
        leaderboardService.getLeaderboard(period, selectedDepartment || undefined),
        leaderboardService.getLeaderboardStats(),
        leaderboardService.getMyRank().catch(() => null), // Handle case where user has no activity
        leaderboardService.getDepartments()
      ]);

      setLeaderboard(leaderboardData);
      setStats(statsData);
      setMyRank(myRankData);
      setDepartments(departmentsData);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      // Only show toast if we haven't shown one in the last 3 seconds
      const now = Date.now();
      if (now - lastErrorRef.current > 3000) {
        toast.error('Failed to load leaderboard data');
        lastErrorRef.current = now;
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-6 w-6 text-yellow-400" />;
    if (rank === 2) return <Medal className="h-6 w-6 text-gray-300" />;
    if (rank === 3) return <Award className="h-6 w-6 text-orange-400" />;
    return <span className="text-lg font-bold text-white">#{rank}</span>;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-500 to-yellow-600';
    if (rank === 2) return 'bg-gradient-to-r from-gray-400 to-gray-500';
    if (rank === 3) return 'bg-gradient-to-r from-orange-500 to-orange-600';
    if (rank <= 10) return 'bg-gradient-to-r from-purple-500 to-purple-600';
    return 'bg-gradient-to-r from-blue-500 to-blue-600';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const periodLabels: Record<LeaderboardPeriod, string> = {
    all: 'All Time',
    month: 'This Month',
    week: 'This Week'
  };

  return (
    <PageLayout>
      <div className="flex-1 flex flex-col relative z-10 px-6 pt-20">
        <div className="max-w-7xl mx-auto w-full space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <GlassCard className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-full bg-gradient-to-r from-primary-500 to-primary-600">
                <Trophy className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
                <p className="text-white/70 text-lg">Community contribution rankings</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          {/* Filters */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/20 pt-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Time Period</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Object.entries(periodLabels).map(([value, label]) => (
                      <option key={value} value={value} className="bg-gray-800">
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Department</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="" className="bg-gray-800">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept} className="bg-gray-800">
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </GlassCard>
      </motion.div>

      {/* Stats Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <GlassCard className="p-6 text-center">
            <Users className="h-12 w-12 text-blue-400 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-white">{stats.total_users.toLocaleString()}</h3>
            <p className="text-white/70">Active Users</p>
          </GlassCard>
          <GlassCard className="p-6 text-center">
            <MessageSquare className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-white">{stats.total_contributions.toLocaleString()}</h3>
            <p className="text-white/70">Contributions</p>
          </GlassCard>
          <GlassCard className="p-6 text-center">
            <Heart className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-white">{stats.total_likes.toLocaleString()}</h3>
            <p className="text-white/70">Likes Given</p>
          </GlassCard>
          <GlassCard className="p-6 text-center">
            <Search className="h-12 w-12 text-purple-400 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-white">{stats.total_searches.toLocaleString()}</h3>
            <p className="text-white/70">Searches</p>
          </GlassCard>
        </motion.div>
      )}

      {/* My Rank Card */}
      {myRank && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <Target className="h-5 w-5 mr-2" />
              Your Ranking
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex items-center space-x-4">
                <div className={`p-4 rounded-full ${getRankBadge(myRank.user.rank)}`}>
                  {getRankIcon(myRank.user.rank)}
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">#{myRank.user.rank}</div>
                  <div className="text-white/70">Your position</div>
                  <div className="text-primary-400 font-semibold">{myRank.user.total_score} points</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{myRank.user.contributions_count}</div>
                  <div className="text-white/70 text-sm">Contributions</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{myRank.user.likes_received}</div>
                  <div className="text-white/70 text-sm">Likes</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{myRank.user.searches_count}</div>
                  <div className="text-white/70 text-sm">Searches</div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <GlassCard className="overflow-hidden">
          <div className="p-6 border-b border-white/20">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Trophy className="h-6 w-6 mr-2 text-yellow-400" />
              Top Contributors - {periodLabels[period]}
            </h2>
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-white/5">
                  <div className="h-12 w-12 bg-white/20 rounded-full animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-white/20 rounded animate-pulse mb-2"></div>
                    <div className="h-3 bg-white/20 rounded animate-pulse w-2/3"></div>
                  </div>
                  <div className="h-6 w-16 bg-white/20 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {leaderboard.map((entry, index) => (
                <motion.div
                  key={entry.user_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`p-6 hover:bg-white/5 transition-colors cursor-pointer ${
                    entry.user_id === user?.id ? 'bg-primary-500/10 border-l-4 border-primary-500' : ''
                  }`}
                  onClick={() => setExpandedUser(expandedUser === entry.user_id ? null : entry.user_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-full ${getRankBadge(entry.rank)}`}>
                        {getRankIcon(entry.rank)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold text-white">
                            {entry.full_name || entry.username}
                          </h3>
                          {entry.user_id === user?.id && (
                            <span className="px-2 py-1 bg-primary-500/20 text-primary-300 text-xs rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-white/70">
                          {entry.department && <span>{entry.department}</span>}
                          <span>Joined {formatDate(entry.join_date)}</span>
                          {entry.last_activity && (
                            <span>Last active {formatDate(entry.last_activity)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">{entry.total_score}</div>
                      <div className="text-white/70 text-sm">points</div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedUser === entry.user_id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-white/20"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <MessageSquare className="h-5 w-5 text-green-400" />
                          </div>
                          <div className="text-lg font-bold text-white">{entry.contributions_count}</div>
                          <div className="text-white/70 text-sm">Contributions</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Heart className="h-5 w-5 text-red-400" />
                          </div>
                          <div className="text-lg font-bold text-white">{entry.likes_received}</div>
                          <div className="text-white/70 text-sm">Likes</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Search className="h-5 w-5 text-blue-400" />
                          </div>
                          <div className="text-lg font-bold text-white">{entry.searches_count}</div>
                          <div className="text-white/70 text-sm">Searches</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Star className="h-5 w-5 text-yellow-400" />
                          </div>
                          <div className="text-lg font-bold text-white">{entry.documents_starred}</div>
                          <div className="text-white/70 text-sm">Stars</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Upload className="h-5 w-5 text-purple-400" />
                          </div>
                          <div className="text-lg font-bold text-white">{entry.documents_uploaded}</div>
                          <div className="text-white/70 text-sm">Uploads</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {!loading && leaderboard.length === 0 && (
            <div className="p-12 text-center">
              <Trophy className="h-16 w-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No rankings yet</h3>
              <p className="text-white/70">
                {selectedDepartment || period !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Be the first to contribute and climb the leaderboard!'}
              </p>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Additional Stats */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {stats.most_active_department && (
            <GlassCard className="p-6 text-center">
              <Users className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-white mb-2">Most Active Department</h3>
              <p className="text-2xl font-semibold text-green-400">{stats.most_active_department}</p>
            </GlassCard>
          )}
          {stats.top_contributor && (
            <GlassCard className="p-6 text-center">
              <Crown className="h-12 w-12 text-yellow-400 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-white mb-2">Top Contributor</h3>
              <p className="text-2xl font-semibold text-yellow-400">{stats.top_contributor}</p>
            </GlassCard>
          )}
        </motion.div>
      )}
        </div>
      </div>
    </PageLayout>
  );
};