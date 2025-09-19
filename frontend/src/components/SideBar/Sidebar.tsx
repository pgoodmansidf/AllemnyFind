// src/components/Sidebar/Sidebar.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Database,
  Globe,
  Star,
  User,
  Calendar,
  MessageSquare,
  Trash2,
  Settings,
  Shield
  , Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '@/store/searchStore';
import { useAuthStore } from '@/store/authStore';
import { SearchResponse } from '@/services/searchApi';
import { starsApi } from '@/services/starsApi';
import toast from 'react-hot-toast';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSearch?: (search: SearchResponse) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose,
  onSelectSearch 
}) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { searchHistory, removeFromHistory } = useSearchStore();
  const [loadingStars, setLoadingStars] = React.useState<Set<string>>(new Set());

  const handleRemoveFromHistory = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation();
    try {
      const search = searchHistory.find(s => s.search_id === searchId);
      if (search?.is_starred) {
        await starsApi.unstar(searchId);
      }
      removeFromHistory(searchId);
      toast.success('Removed from history');
    } catch (error) {
      console.error('Error removing from history:', error);
      toast.error('Failed to remove from history');
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation();
    setLoadingStars(prev => new Set(prev).add(searchId));
    try {
      const search = searchHistory.find(s => s.search_id === searchId);
      if (search?.is_starred) {
        await starsApi.unstar(searchId);
        toast.success('Removed from favorites');
      } else {
        await starsApi.star(searchId);
        toast.success('Added to favorites');
      }
      // Update local state would be handled by parent component
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

  const handleSearchSelect = (search: SearchResponse) => {
    if (onSelectSearch) {
      onSelectSearch(search);
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -300 }}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          transition={{ type: 'spring', damping: 25 }}
          className="fixed left-0 top-0 h-full w-80 z-50 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between mb-6">
              <img 
                src="/images/allemny.png" 
                alt="Navigation"
                className="h-10 object-contain"
              />
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Navigation Section */}
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-3">
                Navigation
              </h3>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
              >
                <Home className="h-5 w-5" />
                <span>Dashboard</span>
              </button>
              
              <button
                onClick={() => navigate('/ingestion')}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
              >
                <Database className="h-5 w-5" />
                <span>Data Ingestion</span>
              </button>
              
              <button
                onClick={() => navigate('/techvault')}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
              >
                <Globe className="h-5 w-5" />
                <span>TechVault</span>
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin/users')}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                >
                  <Shield className="h-5 w-5" />
                  <span>User Admin</span>
                </button>
              )}
            </div>
          </div>
          {/* Search History Section */}
          <div className="flex-1 overflow-hidden flex flex-col px-6">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
              Search History
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {searchHistory.length > 0 ? (
                searchHistory.slice(0, 10).map((search) => (
                  <motion.div
                    key={search.search_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="group relative"
                  >
                    <button
                      onClick={() => handleSearchSelect(search as unknown as SearchResponse)}
                      className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-white/10"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-white/90 text-sm font-medium line-clamp-1 flex-1 pr-2">
                          {search.query}
                        </p>
                        <button
                          onClick={(e) => handleToggleStar(e, search.search_id)}
                          className="p-1 rounded hover:bg-white/10"
                          title={search.is_starred ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {loadingStars.has(search.search_id) ? (
                            <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
                          ) : (
                            <Star className={`h-3 w-3 ${search.is_starred ? 'text-yellow-400 fill-yellow-400' : 'text-white/60 hover:text-yellow-400'}`} />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleRemoveFromHistory(e, search.search_id)}
                          className="p-1 rounded hover:bg-white/10"
                          title="Delete search"
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </button>
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
                    </button>
                  </motion.div>
                ))
              ) : (
                <p className="text-white/60 text-sm">No search history yet</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Provide a default export for compatibility with default imports.
// This allows both `import Sidebar from '.../Sidebar'` and named imports.
export default Sidebar;