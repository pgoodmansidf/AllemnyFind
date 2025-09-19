// frontend/src/pages/InnovateAllemny.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb, Plus, Filter, Search, Star, TrendingUp, MessageSquare,
  ThumbsUp, ThumbsDown, Eye, Edit, Trash2, Check, X, Clock,
  AlertCircle, CheckCircle, XCircle, Settings, Users, BarChart3,
  ChevronDown, ChevronUp, Calendar, User, Tag, ArrowUpDown
} from 'lucide-react';
import { PageLayout } from '@/components/Layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import {
  innovateService,
  Suggestion,
  SuggestionCreate,
  SuggestionUpdate,
  SuggestionAdminUpdate,
  SuggestionFilters,
  SuggestionStats,
  Comment,
  CommentCreate,
  SuggestionCategory,
  SuggestionStatus,
  VoteType,
  categoryLabels,
  statusLabels,
  getStatusColor,
  getCategoryColor,
} from '@/services/innovateService';
import toast from 'react-hot-toast';

export const InnovateAllemny: React.FC = () => {
  const { user } = useAuthStore();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SuggestionFilters>({
    page: 1,
    size: 10,
    sort_by: 'created_at',
    sort_order: 'desc'
  });

  // Form states
  const [newSuggestion, setNewSuggestion] = useState<SuggestionCreate>({
    title: '',
    description: '',
    category: SuggestionCategory.FEATURE,
  });

  // UI states
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [showComments, setShowComments] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [newComment, setNewComment] = useState('');
  const [editingSuggestion, setEditingSuggestion] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<SuggestionUpdate>({});

  // Pagination
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadData();
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await innovateService.getSuggestions(filters);
      setSuggestions(response.suggestions);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await innovateService.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleCreateSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuggestion.title.trim() || !newSuggestion.description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (newSuggestion.description.trim().length < 20) {
      toast.error('Please give more detail in the suggestion');
      return;
    }

    try {
      setSubmitting(true);
      await innovateService.createSuggestion(newSuggestion);
      setNewSuggestion({
        title: '',
        description: '',
        category: SuggestionCategory.FEATURE,
      });
      setShowCreateForm(false);
      toast.success('Suggestion submitted successfully!');
      loadData();
      loadStats();
    } catch (error) {
      console.error('Error creating suggestion:', error);
      toast.error('Failed to create suggestion');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (suggestionId: number, voteType: VoteType) => {
    try {
      const suggestion = suggestions.find(s => s.id === suggestionId);
      if (!suggestion) return;

      if (suggestion.user_vote === voteType) {
        // Remove vote if clicking the same vote
        await innovateService.removeVote(suggestionId);
        toast.success('Vote removed');
      } else {
        // Add or change vote
        await innovateService.voteSuggestion(suggestionId, { vote_type: voteType });
        toast.success(`${voteType === VoteType.UPVOTE ? 'Upvoted' : 'Downvoted'} suggestion`);
      }

      loadData(); // Refresh to get updated vote counts
    } catch (error) {
      console.error('Error voting:', error);
      toast.error('Failed to vote on suggestion');
    }
  };

  const handleDeleteSuggestion = async (suggestionId: number) => {
    if (!confirm('Are you sure you want to delete this suggestion?')) return;

    try {
      await innovateService.deleteSuggestion(suggestionId);
      toast.success('Suggestion deleted successfully');
      loadData();
      loadStats();
    } catch (error) {
      console.error('Error deleting suggestion:', error);
      toast.error('Failed to delete suggestion');
    }
  };

  const handleUpdateSuggestion = async (suggestionId: number) => {
    try {
      await innovateService.updateSuggestion(suggestionId, editFormData);
      setEditingSuggestion(null);
      setEditFormData({});
      toast.success('Suggestion updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating suggestion:', error);
      toast.error('Failed to update suggestion');
    }
  };

  const loadComments = async (suggestionId: number) => {
    try {
      const suggestionComments = await innovateService.getComments(suggestionId);
      setComments(prev => ({
        ...prev,
        [suggestionId]: suggestionComments
      }));
    } catch (error) {
      console.error('Error loading comments:', error);
      toast.error('Failed to load comments');
    }
  };

  const handleAddComment = async (suggestionId: number) => {
    if (!newComment.trim()) return;

    try {
      const comment = await innovateService.createComment(suggestionId, { content: newComment });
      setComments(prev => ({
        ...prev,
        [suggestionId]: [...(prev[suggestionId] || []), comment]
      }));
      setNewComment('');
      toast.success('Comment added');
      loadData(); // Refresh to update comment counts
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  const handleFilterChange = (key: keyof SuggestionFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value // Reset to page 1 when filters change
    }));
  };

  const getStatusIcon = (status: SuggestionStatus) => {
    switch (status) {
      case SuggestionStatus.PENDING:
        return <Clock className="h-4 w-4" />;
      case SuggestionStatus.APPROVED:
        return <Check className="h-4 w-4" />;
      case SuggestionStatus.REJECTED:
        return <X className="h-4 w-4" />;
      case SuggestionStatus.IN_PROGRESS:
        return <Settings className="h-4 w-4 animate-spin" />;
      case SuggestionStatus.IMPLEMENTED:
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

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
              <div className="p-3 rounded-full bg-gradient-to-r from-purple-500 to-purple-600">
                <Lightbulb className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Innovate Allemny</h1>
                <p className="text-gray-300">Share your ideas to improve our platform</p>
              </div>
            </div>
            {!isAdmin && (
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Suggestion
              </Button>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-sm">Total Ideas</p>
                    <p className="text-white text-2xl font-bold">{stats.total_suggestions}</p>
                  </div>
                  <Lightbulb className="h-8 w-8 text-blue-400" />
                </div>
              </div>
              <div className="bg-yellow-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-200 text-sm">Pending</p>
                    <p className="text-white text-2xl font-bold">{stats.pending_suggestions}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-400" />
                </div>
              </div>
              <div className="bg-green-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-200 text-sm">Implemented</p>
                    <p className="text-white text-2xl font-bold">{stats.implemented_suggestions}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </div>
              <div className="bg-purple-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-sm">Total Votes</p>
                    <p className="text-white text-2xl font-bold">{stats.total_votes}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-purple-400" />
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Create Suggestion Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">Submit New Suggestion</h2>

              <form onSubmit={handleCreateSuggestion} className="space-y-6">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newSuggestion.title}
                    onChange={(e) => setNewSuggestion(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Brief, descriptive title for your suggestion"
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Category
                  </label>
                  <select
                    value={newSuggestion.category}
                    onChange={(e) => setNewSuggestion(prev => ({ ...prev, category: e.target.value as SuggestionCategory }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {Object.values(SuggestionCategory).map(category => (
                      <option key={category} value={category}>
                        {categoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Description *
                  </label>
                  <textarea
                    value={newSuggestion.description}
                    onChange={(e) => setNewSuggestion(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Detailed description of your suggestion. What problem does it solve? How would it improve the platform?"
                    rows={6}
                  />
                </div>

                <div className="flex justify-end space-x-4">
                  <Button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                  >
                    {submitting ? 'Submitting...' : 'Submit Suggestion'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="secondary"
              size="sm"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {showFilters ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
            </Button>

            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search suggestions..."
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <ArrowUpDown className="h-4 w-4 text-gray-400" />
            <select
              value={`${filters.sort_by}-${filters.sort_order}`}
              onChange={(e) => {
                const [sort_by, sort_order] = e.target.value.split('-');
                handleFilterChange('sort_by', sort_by);
                handleFilterChange('sort_order', sort_order);
              }}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="created_at-desc">Newest First</option>
              <option value="created_at-asc">Oldest First</option>
              <option value="total_score-desc">Most Popular</option>
              <option value="total_score-asc">Least Popular</option>
              <option value="updated_at-desc">Recently Updated</option>
            </select>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-gray-700 pt-4 mt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Status</label>
                  <select
                    value={filters.status || ''}
                    onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Statuses</option>
                    {Object.values(SuggestionStatus).map(status => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Category</label>
                  <select
                    value={filters.category || ''}
                    onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Categories</option>
                    {Object.values(SuggestionCategory).map(category => (
                      <option key={category} value={category}>
                        {categoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.featured_only || false}
                      onChange={(e) => handleFilterChange('featured_only', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-gray-300 text-sm">Featured Only</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Suggestions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
            <p className="text-gray-400 mt-4">Loading suggestions...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <Lightbulb className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No suggestions found</h3>
            <p className="text-gray-400 mb-6">
              {!isAdmin ? "Be the first to share your innovative ideas!" : "No suggestions have been submitted yet."}
            </p>
            {!isAdmin && (
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create First Suggestion
              </Button>
            )}
          </GlassCard>
        ) : (
          <>
            {suggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {suggestion.is_featured && (
                          <Star className="h-5 w-5 text-yellow-400 fill-current" />
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(suggestion.status)}`}>
                          {getStatusIcon(suggestion.status)}
                          <span className="ml-1">{statusLabels[suggestion.status]}</span>
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(suggestion.category)}`}>
                          {categoryLabels[suggestion.category]}
                        </span>
                      </div>

                      <h3 className="text-xl font-semibold text-white mb-2">{suggestion.title}</h3>

                      <p className="text-gray-300 mb-4 line-clamp-3">
                        {suggestion.description}
                      </p>

                      <div className="flex items-center space-x-6 text-sm text-gray-400">
                        <div className="flex items-center space-x-1">
                          <User className="h-4 w-4" />
                          <span>{suggestion.submitter_name || suggestion.submitter_username}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(suggestion.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MessageSquare className="h-4 w-4" />
                          <span>{suggestion.comments_count} comments</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-6">
                      {/* Voting */}
                      {suggestion.user_id !== user?.id && (
                        <div className="flex items-center space-x-1">
                          <Button
                            size="sm"
                            variant={suggestion.user_vote === VoteType.UPVOTE ? "primary" : "secondary"}
                            onClick={() => handleVote(suggestion.id, VoteType.UPVOTE)}
                            className="p-2"
                          >
                            <ThumbsUp className="h-4 w-4" />
                            <span className="ml-1">{suggestion.upvotes_count}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant={suggestion.user_vote === VoteType.DOWNVOTE ? "primary" : "secondary"}
                            onClick={() => handleVote(suggestion.id, VoteType.DOWNVOTE)}
                            className="p-2"
                          >
                            <ThumbsDown className="h-4 w-4" />
                            <span className="ml-1">{suggestion.downvotes_count}</span>
                          </Button>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (showComments === suggestion.id) {
                              setShowComments(null);
                            } else {
                              setShowComments(suggestion.id);
                              loadComments(suggestion.id);
                            }
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>

                        {(suggestion.user_id === user?.id && suggestion.status === SuggestionStatus.PENDING) && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingSuggestion(suggestion.id);
                                setEditFormData({
                                  title: suggestion.title,
                                  description: suggestion.description,
                                  category: suggestion.category,
                                });
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDeleteSuggestion(suggestion.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedSuggestion(suggestion)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Edit Form */}
                  {editingSuggestion === suggestion.id && (
                    <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
                      <input
                        type="text"
                        value={editFormData.title || ''}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        placeholder="Title"
                      />
                      <textarea
                        value={editFormData.description || ''}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        placeholder="Description"
                        rows={4}
                      />
                      <select
                        value={editFormData.category || suggestion.category}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value as SuggestionCategory }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      >
                        {Object.values(SuggestionCategory).map(category => (
                          <option key={category} value={category}>
                            {categoryLabels[category]}
                          </option>
                        ))}
                      </select>
                      <div className="flex justify-end space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingSuggestion(null);
                            setEditFormData({});
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateSuggestion(suggestion.id)}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Comments Section */}
                  {showComments === suggestion.id && (
                    <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
                      <h4 className="text-lg font-semibold text-white">Comments</h4>

                      {/* Add Comment */}
                      <div className="flex space-x-3">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Add a comment..."
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(suggestion.id);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAddComment(suggestion.id)}
                          disabled={!newComment.trim()}
                        >
                          Comment
                        </Button>
                      </div>

                      {/* Comments List */}
                      <div className="space-y-3">
                        {comments[suggestion.id]?.map(comment => (
                          <div key={comment.id} className="bg-gray-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-white">
                                  {comment.full_name || comment.username}
                                </span>
                                {comment.is_admin_response && (
                                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <span className="text-gray-400 text-sm">
                                {new Date(comment.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-gray-300">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-4 mt-8">
                <Button
                  variant="secondary"
                  disabled={filters.page === 1}
                  onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                >
                  Previous
                </Button>

                <span className="text-gray-300">
                  Page {filters.page || 1} of {totalPages}
                </span>

                <Button
                  variant="secondary"
                  disabled={filters.page === totalPages}
                  onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Admin Modal for suggestion management */}
      {selectedSuggestion && isAdmin && (
        <AdminSuggestionModal
          suggestion={selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
          onUpdate={loadData}
        />
      )}
        </div>
      </div>
    </PageLayout>
  );
};

// Admin Modal Component
interface AdminSuggestionModalProps {
  suggestion: Suggestion;
  onClose: () => void;
  onUpdate: () => void;
}

const AdminSuggestionModal: React.FC<AdminSuggestionModalProps> = ({
  suggestion,
  onClose,
  onUpdate,
}) => {
  const [adminUpdate, setAdminUpdate] = useState<SuggestionAdminUpdate>({
    status: suggestion.status,
    admin_notes: suggestion.admin_notes || '',
    priority: suggestion.priority || 0,
    is_featured: suggestion.is_featured || false,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await innovateService.adminUpdateSuggestion(suggestion.id, adminUpdate);
      toast.success('Suggestion updated successfully');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating suggestion:', error);
      toast.error('Failed to update suggestion');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-800 rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white mb-6">Admin: Manage Suggestion</h2>

        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
          <h3 className="font-semibold text-white mb-2">{suggestion.title}</h3>
          <p className="text-gray-300 text-sm">{suggestion.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Status
            </label>
            <select
              value={adminUpdate.status}
              onChange={(e) => setAdminUpdate(prev => ({ ...prev, status: e.target.value as SuggestionStatus }))}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {Object.values(SuggestionStatus).map(status => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Priority (0-10)
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={adminUpdate.priority || 0}
              onChange={(e) => setAdminUpdate(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={adminUpdate.is_featured || false}
                onChange={(e) => setAdminUpdate(prev => ({ ...prev, is_featured: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Featured Suggestion</span>
            </label>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Admin Notes
            </label>
            <textarea
              value={adminUpdate.admin_notes || ''}
              onChange={(e) => setAdminUpdate(prev => ({ ...prev, admin_notes: e.target.value }))}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Optional notes about this decision..."
              rows={4}
            />
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              {submitting ? 'Updating...' : 'Update Suggestion'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};