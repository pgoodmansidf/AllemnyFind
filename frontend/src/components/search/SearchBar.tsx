import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Globe,
  Sparkles,
  X,
  Loader2,
  Clock,
  ChevronDown
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/store/searchStore';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'; // Assuming this is your tooltip component

interface SearchBarProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isSearching, autoFocus = false }) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    currentQuery,
    setCurrentQuery,
    includeOnline,
    setIncludeOnline,
    clearSearchResults
  } = useSearchStore();

  const debouncedQuery = useDebounce(currentQuery, 300);

  // Auto focus on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSearch = () => {
    if (currentQuery.trim() && !isSearching) {
      onSearch(currentQuery);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClear = () => {
    setCurrentQuery('');
    clearSearchResults();
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <GlassCard className="p-1">
        <div className="flex items-center space-x-2">
          {/* Search Input */}
          <div className="flex-1 relative">
            <div className="flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-white/60 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                placeholder="Find"
                className="w-full pl-12 pr-12 py-4 bg-transparent text-white placeholder-white/50 
                         focus:outline-none text-lg font-medium"
                disabled={isSearching}
              />
              {currentQuery && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 p-1 text-white/60 hover:text-white transition-colors"
                  disabled={isSearching}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <TooltipProvider>
            {/* Online Search Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIncludeOnline(!includeOnline)}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                    includeOnline
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'
                  }`}
                  disabled={isSearching}
                >
                  <Globe className="h-4 w-4" />
                  {/* <span className="text-sm font-medium">Online</span> */}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Include online results</p>
              </TooltipContent>
            </Tooltip>

            {/* Search Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="primary"
                  onClick={handleSearch}
                  disabled={!currentQuery.trim() || isSearching}
                  loading={isSearching}
                  className="px-6"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="ml-2">Searching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      {/* <span className="ml-2">Search</span> */}
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Start a new search</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </GlassCard>
    </div>
  );
};