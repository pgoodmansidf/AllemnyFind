import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Star,
  Trash2,
  FileText,
  Brain,
  BookOpen,
  Calendar,
  Tag,
  Search,
  Filter,
  Loader2
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSummarizationStore } from '@/store/summarizationStore';
import toast from 'react-hot-toast';

export const SummaryHistory: React.FC = () => {
  const {
    summaryHistory,
    currentSummary,
    streamingContent,
    loadSummary,
    toggleSummaryStar,
    deleteSummary,
    loadSummaryHistory,
    clearStreamingContent
  } = useSummarizationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [loadingSummaryId, setLoadingSummaryId] = useState<string | null>(null);

  useEffect(() => {
    // Load history on mount
    loadSummaryHistory();
  }, []);

  const filteredHistory = summaryHistory.filter(summary => {
    const matchesSearch = searchQuery === '' ||
      summary.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === '' || summary.summary_type === filterType;
    const matchesStarred = !showStarredOnly || summary.is_starred;
    
    return matchesSearch && matchesType && matchesStarred;
  });

  const handleLoadSummary = async (summaryId: string) => {
    try {
      setLoadingSummaryId(summaryId);
      clearStreamingContent(); // Clear any existing content
      await loadSummary(summaryId);
      // Don't navigate away, stay on the history tab
      toast.success('Summary loaded');
    } catch (error) {
      console.error('Error loading summary:', error);
      toast.error('Failed to load summary');
    } finally {
      setLoadingSummaryId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, summaryId: string) => {
    e.stopPropagation(); // Prevent triggering the load
    
    if (confirm('Are you sure you want to delete this summary?')) {
      try {
        await deleteSummary(summaryId);
        toast.success('Summary deleted');
      } catch (error) {
        toast.error('Failed to delete summary');
      }
    }
  };

  const handleStarToggle = async (e: React.MouseEvent, summaryId: string) => {
    e.stopPropagation(); // Prevent triggering the load
    
    try {
      await toggleSummaryStar(summaryId);
    } catch (error) {
      toast.error('Failed to toggle star');
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const getSummaryIcon = (type: string) => {
    switch (type) {
      case 'executive':
        return <Brain className="h-5 w-5 text-purple-400" />;
      case 'research_brief':
        return <BookOpen className="h-5 w-5 text-blue-400" />;
      default:
        return <FileText className="h-5 w-5 text-green-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Display loaded summary if exists */}
      {currentSummary && (
        <div className="mb-6">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Loaded Summary</h3>
              <Button
                variant="glass"
                size="sm"
                onClick={() => clearStreamingContent()}
              >
                Clear
              </Button>
            </div>
            <div className="p-4 bg-white/5 rounded-lg">
              <h4 className="text-white font-medium mb-2">{currentSummary.title}</h4>
              <p className="text-white/60 text-sm line-clamp-3">
                {currentSummary.full_summary?.substring(0, 200)}...
              </p>
            </div>
          </GlassCard>
        </div>
      )}

      <GlassCard className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Summary History</h2>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search summaries..."
                  className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg 
                           text-white placeholder-white/40 focus:outline-none focus:border-primary-400"
                />
              </div>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white 
                       focus:outline-none focus:border-primary-400"
            >
              <option value="">All Types</option>
              <option value="general">General</option>
              <option value="executive">Executive</option>
              <option value="research_brief">Research Brief</option>
            </select>

            <Button
              variant={showStarredOnly ? 'primary' : 'glass'}
              size="sm"
              icon={<Star className="h-4 w-4" />}
              onClick={() => setShowStarredOnly(!showStarredOnly)}
            >
              Starred Only
            </Button>
          </div>
        </div>

        {/* Summary List */}
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No summaries found</p>
            {showStarredOnly && (
              <p className="text-white/40 text-sm mt-2">Try disabling the starred filter</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredHistory.map((summary) => (
              <motion.div
                key={summary.id}
                whileHover={{ scale: 1.01 }}
                className={`p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 
                         transition-all cursor-pointer ${
                           loadingSummaryId === summary.id ? 'opacity-50' : ''
                         }`}
                onClick={() => !loadingSummaryId && handleLoadSummary(summary.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getSummaryIcon(summary.summary_type)}
                      <h3 className="text-lg font-medium text-white">{summary.title}</h3>
                      {summary.is_starred && (
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                      )}
                      {loadingSummaryId === summary.id && (
                        <Loader2 className="h-4 w-4 text-primary-400 animate-spin" />
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-white/60">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(summary.created_at)}</span>
                      </span>
                      <span>{summary.document_count} documents</span>
                      <span>{summary.word_count} words</span>
                      {summary.processing_time && (
                        <span>{(summary.processing_time).toFixed(1)}s</span>
                      )}
                    </div>

                    {summary.topics && Array.isArray(summary.topics) && summary.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {summary.topics.slice(0, 3).map((topic, index) => (
                          <span
                            key={`${topic}-${index}`}
                            className="px-2 py-0.5 bg-primary-500/20 rounded text-xs text-primary-300"
                          >
                            {topic}
                          </span>
                        ))}
                        {summary.topics.length > 3 && (
                          <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">
                            +{summary.topics.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="glass"
                      size="sm"
                      icon={<Star className={`h-4 w-4 ${summary.is_starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />}
                      onClick={(e) => handleStarToggle(e, summary.id)}
                    />
                    <Button
                      variant="glass"
                      size="sm"
                      icon={<Trash2 className="h-4 w-4 text-red-400" />}
                      onClick={(e) => handleDelete(e, summary.id)}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};