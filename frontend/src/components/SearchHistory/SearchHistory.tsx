import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Search,
  Calendar,
  Globe,
  AlertCircle,
  X,
  MessageSquare,
  Star,
  Loader2
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSearchStore } from '@/store/searchStore';
import { SearchResponse } from '@/services/searchApi';
import { starsApi } from '@/services/starsApi';
import toast from 'react-hot-toast';

interface SearchHistoryProps {
  onSelectSearch: (search: SearchResponse) => void;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({ onSelectSearch }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [starredSearches, setStarredSearches] = useState<Set<string>>(new Set());
  const [loadingStars, setLoadingStars] = useState<Set<string>>(new Set());
  const { searchHistory, showHistory, setShowHistory, deleteSearchFromHistory } = useSearchStore();

  // Load starred status for all searches on mount
  useEffect(() => {
    const loadStarredStatus = async () => {
      try {
        const starredIds = new Set<string>();
        for (const search of searchHistory) {
          const status = await starsApi.getSearchStarStatus(search.id);
          if (status.is_starred) {
            starredIds.add(search.id);
          }
        }
        setStarredSearches(starredIds);
      } catch (error) {
        console.error('Error loading starred status:', error);
      }
    };

    if (searchHistory.length > 0) {
      loadStarredStatus();
    }
  }, [searchHistory]);

  const handleDelete = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation();
    await deleteSearchFromHistory(searchId);
  };

  const handleStarToggle = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation(); // Prevent triggering the search selection
    setLoadingStars(prev => new Set(prev).add(searchId));
    try {
      if (starredSearches.has(searchId)) {
        // Unstar
        await starsApi.unstarSearch(searchId);
        setStarredSearches(prev => {
          const newSet = new Set(prev);
          newSet.delete(searchId);
          return newSet;
        });
        toast.success('Search removed from favorites');
      } else {
        // Star
        await starsApi.starSearch(searchId);
        setStarredSearches(prev => new Set(prev).add(searchId));
        toast.success('Search added to favorites');
      }
    } catch (error) {
      console.error('Error toggling star:', error);
      toast.error('Failed to update favorite status');
    } finally {
      setLoadingStars(prev => {
        const newSet = new Set(prev);
        newSet.delete(searchId);
        return newSet;
      });
    }
  };

  const handleSearchSelect = (e: React.MouseEvent, search: SearchResponse) => {
    e.stopPropagation();
    onSelectSearch(search);
    if (!isCollapsed) {
      setIsCollapsed(true);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (!showHistory) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -300 }}
        animate={{ opacity: 1, x: isCollapsed ? -240 : 0 }}
        exit={{ opacity: 0, x: -300 }}
        transition={{ type: 'spring', damping: 25 }}
        className={`fixed left-0 top-0 h-full z-40 transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-80'
        }`}
      >
        <GlassCard className="h-full flex flex-col bg-black/60 backdrop-blur-xl">
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <History className="h-5 w-5 text-primary-400" />
                  <span>Search History</span>
                </h3>
              )}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 
                           hover:text-white"
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-5 w-5" />
                  ) : (
                    <ChevronLeft className="h-5 w-5" />
                  )}
                </button>
                {!isCollapsed && (
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 
                             hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Collapsed State - Show Icons Only */}
          {isCollapsed && (
            <div className="flex-1 overflow-y-auto p-2">
              <button
                onClick={() => setIsCollapsed(false)}
                className="w-full p-3 rounded-lg hover:bg-white/10 transition-colors"
                title="Expand History"
              >
                <History className="h-5 w-5 text-white/60 mx-auto" />
              </button>
              {/* Show star indicators for starred searches */}
              {searchHistory.slice(0, 5).map((search) => (
                <div
                  key={search.id}
                  className="relative w-full p-2"
                  title={search.query}
                >
                  {starredSearches.has(search.id) && (
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 mx-auto" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Expanded State - Show Full History */}
          {!isCollapsed && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 text-sm">No search history yet</p>
                </div>
              ) : (
                <AnimatePresence>
                  {searchHistory.map((search, index) => (
                    <motion.div
                      key={search.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={(e) => handleSearchSelect(e, search)}
                      className={`p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all 
                               duration-200 cursor-pointer group relative ${
                                 starredSearches.has(search.id) ? 'ring-1 ring-yellow-400/30' : ''
                               }`}
                    >
                      {/* Star indicator for starred searches */}
                      {starredSearches.has(search.id) && (
                        <div className="absolute top-2 left-2">
                          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                        </div>
                      )}
                      
                      <div className="flex items-start justify-between mb-2">
                        <p className={`text-white font-medium text-sm line-clamp-2 flex-1 ${
                          starredSearches.has(search.id) ? 'pl-5' : ''
                        }`}>
                          {search.query}
                        </p>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleStarToggle(e, search.id)}
                            className="p-1 rounded hover:bg-white/10"
                            title={starredSearches.has(search.id) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {loadingStars.has(search.id) ? (
                              <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
                            ) : (
                              <Star 
                                className={`h-3 w-3 ${
                                  starredSearches.has(search.id) 
                                    ? 'text-yellow-400 fill-yellow-400' 
                                    : 'text-white/60 hover:text-yellow-400'
                                }`} 
                              />
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, search.id)}
                            className="p-1 rounded hover:bg-white/10"
                            title="Delete search"
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(search.timestamp)}</span>
                        </span>
                        <div className="flex items-center space-x-2">
                          {search.comments && search.comments.length > 0 && (
                            <span className="flex items-center space-x-1 text-primary-400">
                              <MessageSquare className="h-3 w-3" />
                              <span>{search.comments.length}</span>
                            </span>
                          )}
                          {search.include_online && (
                            <Globe className="h-3 w-3 text-blue-400" />
                          )}
                          {!search.success && (
                            <AlertCircle className="h-3 w-3 text-red-400" />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}

          {/* Starred searches summary at bottom */}
          {!isCollapsed && starredSearches.size > 0 && (
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Starred searches:</span>
                <span className="text-yellow-400 font-medium">
                  {starredSearches.size} / {searchHistory.length}
                </span>
              </div>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
};

// Provide default export for SearchHistory.
export default SearchHistory;