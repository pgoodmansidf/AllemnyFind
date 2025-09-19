// src/pages/TechVaultPage.tsx - CLEAN NAVIGATION WITH PROPER Z-INDEX
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Shield,
  ChevronLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/Layout/PageLayout';
import { MachinerySearch } from '@/components/techvault/MachinerySearch';
import { MachineryResults } from '@/components/techvault/MachineryResults';
import { MachineryAdmin } from '@/components/techvault/MachineryAdmin';
import { MachineryComparison } from '@/components/techvault/MachineryComparison';
import { Button } from '@/components/ui/Button';
import { machineryApi } from '@/services/machineryApi';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface MachineryItem {
  id: string;
  sector: string | null;
  project_name: string | null;
  sau_number: string | null;
  description: string;
  manufacturer: string | null;
  origin: string | null;
  cost: number | null;
  cost_index: number | null;
  unit_of_measure: string | null;
  unit: string | null;
  production_year: number | null;
  last_update: string | null;
  sau_numbers: string[];
  similarity_score?: number;
  highlighted_sau?: string[];
}

export const TechVaultPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [currentView, setCurrentView] = useState<'search' | 'results' | 'comparison' | 'admin'>('search');
  const [searchResults, setSearchResults] = useState<MachineryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparedItems, setComparedItems] = useState<string[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);
  
  const isAdmin = user?.role === 'admin';

  const handleSearch = async (query: string, filters?: any) => {
    setIsSearching(true);
    setSearchMessage(null);
    setSearchProgress('Initializing Machinery search...');
    setComparedItems([]);
    setCompareMode(false);

    try {
      // Show progressive search messages
      const progressMessages = [
        'Analyzing search query...',
        'Scanning machinery database...',
        'Matching equipment specifications...',
        'Applying filters and ranking results...',
        'Finalizing search results...'
      ];

      let messageIndex = 0;
      const progressInterval = setInterval(() => {
        if (messageIndex < progressMessages.length) {
          setSearchProgress(progressMessages[messageIndex]);
          messageIndex++;
        }
      }, 600);

      const response = await machineryApi.search({
        query,
        filters,
        limit: 50
      });

      clearInterval(progressInterval);
      setSearchProgress('Search completed successfully!');

      // Brief delay to show completion message
      setTimeout(() => {
        setSearchProgress(null);
        setSearchResults(response.results || []);

        if (response.search_message) {
          setSearchMessage(response.search_message);
        }

        setCurrentView('results');
      }, 500);

    } catch (error) {
      setSearchProgress(null);
      console.error('Search error:', error);
      toast.error('Failed to search machinery. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCompare = (id: string) => {
    if (comparedItems.includes(id)) {
      setComparedItems(comparedItems.filter(item => item !== id));
    } else {
      if (comparedItems.length < 5) {
        setComparedItems([...comparedItems, id]);
      } else {
        toast.error('You can compare up to 5 items at a time');
      }
    }
  };

  const handleShowComparison = () => {
    if (comparedItems.length < 2) {
      toast.error('Please select at least 2 items to compare');
      return;
    }
    setCurrentView('comparison');
  };

  const handleBackToResults = () => {
    setCurrentView('results');
  };

  const handleBackToSearch = () => {
    setCurrentView('search');
    setSearchResults([]);
    setComparedItems([]);
    setCompareMode(false);
    setSearchMessage(null);
    setSearchProgress(null);
  };

  // Unified handler for back button that handles all cases
  const handleBackButton = () => {
    switch (currentView) {
      case 'comparison':
        handleBackToResults();
        break;
      case 'results':
        handleBackToSearch();
        break;
      case 'admin':
        handleBackToSearch();
        break;
      default:
        break;
    }
  };

  const handleAdminButton = () => {
    if (currentView === 'admin') {
      handleBackToSearch();
    } else {
      setCurrentView('admin');
    }
  };

  return (
    <PageLayout>
      {/* Navigation Buttons Container - Fixed positioning with proper z-index */}
      <div 
        className="fixed top-6 left-0 right-0 z-[100]"
        style={{ zIndex: 100 }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center">
            {/* Back Button - Left Side */}
            <div className="min-w-[120px]">
              <AnimatePresence mode="wait">
                {currentView !== 'search' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Button
                      variant="glass"
                      onClick={handleBackButton}
                      className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 hover:border-white/30 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                      <span className="font-medium">
                        {currentView === 'comparison' ? 'Results' : 
                         currentView === 'admin' ? 'Search' : 'Back'}
                      </span>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Admin Button - Right Side */}
            <div className="min-w-[150px] flex justify-end">
              <AnimatePresence mode="wait">
                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Button
                      onClick={handleAdminButton}
                      className={`group flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 ${
                        currentView === 'admin' 
                          ? 'bg-white/20 hover:bg-white/30 backdrop-blur-xl border border-white/30 text-white' 
                          : 'bg-gradient-to-r from-purple-600/80 to-blue-600/80 hover:from-purple-600 hover:to-blue-600 backdrop-blur-xl border border-white/20 text-white'
                      }`}
                    >
                      <Shield className="h-4 w-4 group-hover:scale-110 transition-transform" />
                      <span className="font-medium">
                        {currentView === 'admin' ? 'Exit Admin' : 'Admin Panel'}
                      </span>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col relative px-6 pt-24">
        {/* Search Progress Overlay */}
        {isSearching && searchProgress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 max-w-md mx-4"
            >
              <div className="flex flex-col items-center text-center">
                <Settings className="h-12 w-12 text-yellow-400 mb-4 animate-spin" />
                <h3 className="text-xl font-bold text-white mb-2">Nachinery Search</h3>
                <p className="text-white/80 mb-4">{searchProgress}</p>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <motion.div
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        <div className="max-w-7xl mx-auto w-full">
          {/* Main Content */}
          <AnimatePresence mode="wait">
            {currentView === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-center min-h-[70vh]"
              >
                <MachinerySearch onSearch={handleSearch} />
              </motion.div>
            )}

            {currentView === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MachineryResults
                  results={searchResults}
                  isLoading={isSearching}
                  compareMode={compareMode}
                  comparedItems={comparedItems}
                  onCompare={handleCompare}
                  onToggleCompareMode={() => setCompareMode(!compareMode)}
                  onShowComparison={handleShowComparison}
                  searchMessage={searchMessage}
                  searchProgress={searchProgress}
                />
              </motion.div>
            )}

            {currentView === 'comparison' && (
              <motion.div
                key="comparison"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MachineryComparison
                  selectedItems={comparedItems}
                  searchResults={searchResults}
                  onBack={handleBackToResults}
                />
              </motion.div>
            )}

            {currentView === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MachineryAdmin />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageLayout>
  );
};