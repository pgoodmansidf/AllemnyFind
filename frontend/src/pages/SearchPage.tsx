// SearchPage.tsx - COMPLETE VERSION WITH ALL FIXES INCLUDING DUPLICATE SAVE PREVENTION

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Database,
  Home,
  Globe,
  Star,
  User,
  Circle,
  Search,
  Calendar,
  MessageSquare,
  AlertCircle,
  Trash2,
  Loader2,
  Zap,  
  Plus,
  Settings,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResults } from '@/components/search/SearchResults';
import { SearchGreeting } from '@/components/search/SearchGreeting';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/store/searchStore';
import { useAuthStore } from '@/store/authStore';
import { SearchResponse } from '@/services/searchApi';
import { useSearchSSE } from '@/hooks/useSearchSSE';
import { starsApi } from '@/services/starsApi';
import toast from 'react-hot-toast';

export const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [hasSearched, setHasSearched] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [stageMessage, setStageMessage] = useState('');
  const [currentDocumentGroups, setCurrentDocumentGroups] = useState<Record<string, any[]>>({});
  const [starredSearches, setStarredSearches] = useState<Set<string>>(new Set());
  const [loadingStars, setLoadingStars] = useState<Set<string>>(new Set());
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // New state for intelligent search features
  const [responseType, setResponseType] = useState<'single_result' | 'multiple_results' | 'content_chunk' | 'no_results' | null>(null);
  const [productData, setProductData] = useState<any>(null);
  const [productList, setProductList] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Store the original query separately to preserve it
  const originalQueryRef = useRef<string>('');
  
  const {
    searchResults,
    searchHistory,
    testConnection,
    isConnected,
    addStreamChunk,
    clearStreamingContent,
    completeSearch,
    clearSearchResults,
    currentQuery,
    loadSearchHistory,
    resetSearch,
    deleteSearchFromHistory,
    setCurrentQuery
  } = useSearchStore();

  const { 
    isConnected: sseConnected, 
    isSearching, 
    performSearch,
    performProductSearch,
    documentGroups,
    resetSearchState
  } = useSearchSSE({
    onStreamChunk: (chunk: any) => {
      console.log('Received chunk:', chunk);
      
      switch (chunk.type) {
        case 'stage_update':
          setStageMessage(chunk.message || '');
          setIsStreaming(true);
          break;
          
        case 'content_chunk':
          if (chunk.content) {
            setStreamingContent(prev => prev + chunk.content);
            addStreamChunk(chunk);
            setResponseType('content_chunk');
          }
          break;
          
        case 'content_complete':
          if (chunk.content) {
            setStreamingContent(chunk.content);
          }
          break;
          
        case 'single_result':
          console.log('Single product result:', chunk.data);
          setResponseType('single_result');
          setProductData(chunk.data);
          setProductList([]);
          setIsStreaming(false);
          break;
          
        case 'multiple_results':
          console.log('Multiple products found:', chunk.products);
          setResponseType('multiple_results');
          setProductList(chunk.products || []);
          setProductData(null);
          setIsStreaming(false);
          break;
          
        case 'no_results':
          console.log('No results found');
          setResponseType('no_results');
          setProductData(null);
          setProductList([]);
          setStreamingContent('');
          setIsStreaming(false);
          setStageMessage('');
          break;
          
        case 'document_groups':
          if (chunk.groups) {
            setCurrentDocumentGroups(chunk.groups);
          }
          break;
          
        case 'search_complete':
          setIsStreaming(false);
          
          // Don't save searches that only return a product list for selection
          // These are intermediate searches that will be followed by a product-specific search
          if (responseType === 'multiple_results' && !chunk.metadata?.selected_product) {
            console.log('Skipping save for product selection list');
            setStageMessage('');
            if (chunk.document_groups) {
              setCurrentDocumentGroups(chunk.document_groups);
            }
            // Don't call completeSearch() here - we don't want to save this to history
            break;
          }
          
          // Determine what content to save based on the response type
          let finalContent = '';
          let finalResponseType = responseType;
          
          if (responseType === 'no_results') {
            finalContent = 'No results found';
          } else if (responseType === 'multiple_results' && productList.length > 0) {
            finalContent = `Found ${productList.length} products`;
          } else if (responseType === 'single_result' && productData) {
            finalContent = `Product analysis for ${productData.product || 'selected product'}`;
          } else {
            finalContent = streamingContent || chunk.content || '';
          }
          
          // Get the search ID from the chunk or generate one
          const searchId = chunk.search_id || `search_${Date.now()}`;
          
          const result: SearchResponse = {
            id: searchId,
            query: originalQueryRef.current || currentQuery,
            response: finalContent,
            citations_count: countCitations(finalContent),
            processing_time: chunk.processing_time || 0,
            include_online: false,
            success: true,
            timestamp: new Date().toISOString(),
            document_groups: chunk.document_groups || currentDocumentGroups,
            metadata: {
              responseType: finalResponseType,
              productData: productData,
              productList: productList,
              selectedProduct: chunk.metadata?.selected_product,
              originalQuery: originalQueryRef.current,
              streamingContent: streamingContent || finalContent,
              displayState: {
                responseType: finalResponseType,
                productData: productData,
                productList: productList,
                hasSearched: true
              },
              // Include the original backend metadata
              ...(chunk.metadata || {})
            }
          };
          
          console.log('Saving search with full metadata:', {
            id: searchId,
            responseType: finalResponseType,
            hasContent: !!finalContent,
            productCount: productList?.length,
            hasProductData: !!productData,
            streamingContent: !!streamingContent,
            selectedProduct: chunk.metadata?.selected_product
          });
          
          // Only save to history if this is a final result
          completeSearch(result);
          
          setStageMessage('');
          if (chunk.document_groups) {
            setCurrentDocumentGroups(chunk.document_groups);
          }
          break;
          
        case 'error':
          toast.error(chunk.message || 'Search error occurred');
          setStageMessage('');
          setIsStreaming(false);
          break;
      }
    },
    onDocumentGroups: (groups: Record<string, any[]>) => {
      setCurrentDocumentGroups(groups);
      console.log('Document groups received:', groups);
    },
    onSearchComplete: (processingTime: number, documentGroups?: Record<string, any[]>) => {
      console.log(`Search completed in ${processingTime}ms`);
      setIsStreaming(false);
      if (documentGroups) {
        setCurrentDocumentGroups(documentGroups);
      }
    },
    onError: (error: string) => {
      console.error('Search error:', error);
      setStageMessage('');
      setIsStreaming(false);
      toast.error(error);
    },
    onSingleResult: (data: any) => {
      console.log('Single result handler:', data);
      setResponseType('single_result');
      setProductData(data);
      setProductList([]);
    },
    onMultipleResults: (products: any[]) => {
      console.log('Multiple results handler:', products);
      setResponseType('multiple_results');
      setProductList(products);
      setProductData(null);
    },
    onNoResults: (message: string) => {
      console.log('No results handler:', message);
      setResponseType('no_results');
      setProductData(null);
      setProductList([]);
      setIsStreaming(false);
    }
  });

  // Load starred status for all searches
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

  const countCitations = (content: string): number => {
    const citationPattern = /\[(\d+)\]/g;
    const citations = new Set<string>();
    let match;
    while ((match = citationPattern.exec(content)) !== null) {
      citations.add(match[1]);
    }
    return citations.size;
  };

  useEffect(() => {
    const initPage = async () => {
      await testConnection();
      await loadSearchHistory();
    };
    initPage();
  }, [testConnection, loadSearchHistory]);

  const handleSearch = async (query: string) => {
    clearSearchResults();
    clearStreamingContent();
    resetSearch();
    setStreamingContent('');
    setStageMessage('Initializing search...');
    setHasSearched(true);
    setShowSearchBar(false);
    setCurrentDocumentGroups({});
    setResponseType(null);
    setProductData(null);
    setProductList([]);
    setIsStreaming(true);
    
    originalQueryRef.current = query;
    setCurrentQuery(query);
    
    const success = await performSearch(query, false);
    if (!success) {
      toast.error('Failed to perform search');
      setStageMessage('');
      setIsStreaming(false);
      // Don't set hasSearched to false here, keep the UI in search mode
    }
  };

  const handleNewSearch = () => {
    // Properly reset all states for a new search
    setHasSearched(false);
    setShowSearchBar(false);
    clearSearchResults();
    clearStreamingContent();
    setStreamingContent('');
    setResponseType(null);
    setProductData(null);
    setProductList([]);
    setCurrentDocumentGroups({});
    setStageMessage('');
    setIsStreaming(false);
    originalQueryRef.current = '';
    setCurrentQuery('');
    resetSearchState();
    resetSearch();
  };

  const handleProductSelection = async (product: string) => {
    console.log('Product selected:', product);
    console.log('Original query stored:', originalQueryRef.current);
    
    setStreamingContent('');
    setResponseType(null);
    setProductData(null);
    setProductList([]);
    setStageMessage('Analyzing product...');
    setIsStreaming(true);
    
    const queryToUse = originalQueryRef.current || currentQuery;
    console.log('Using query for product search:', queryToUse);
    
    const success = await performProductSearch(queryToUse, product);
    if (!success) {
      toast.error('Failed to analyze product');
      setStageMessage('');
      setIsStreaming(false);
    }
  };

  const handleSelectHistoryItem = async (search: SearchResponse) => {
    // Prevent multiple clicks
    if (isLoadingHistory) return;
    
    console.log('Selecting search from history:', search);
    setIsLoadingHistory(true);
    
    try {
      // Check if this is a product search without frontend metadata
      const isProductSearch = search.metadata?.selected_product;
      const hasFrontendState = search.metadata?.displayState || 
                               search.metadata?.responseType ||
                               search.metadata?.productData;
      
      if (isProductSearch && !hasFrontendState) {
        // This is a product search from backend without frontend state
        // We need to re-execute the search to get the proper display
        console.log('Re-executing product search for:', search.metadata.selected_product);
        
        // Set up the UI for searching
        setHasSearched(true);
        setShowSearchBar(false);
        clearSearchResults();
        clearStreamingContent();
        setStreamingContent('');
        setStageMessage('Loading search results...');
        setIsStreaming(true);
        
        // Store the original query
        originalQueryRef.current = search.query;
        setCurrentQuery(search.query);
        
        // Re-execute the product search
        const success = await performProductSearch(search.query, search.metadata.selected_product);
        if (!success) {
          toast.error('Failed to load search results');
          setStageMessage('');
          setIsStreaming(false);
        }
        return;
      }
      
      // Regular restoration path for searches with complete metadata
      clearSearchResults();
      clearStreamingContent();
      setShowSearchBar(false);
      setStageMessage('');
      setIsStreaming(false);
      
      // Set that we have searched
      setHasSearched(true);
      
      // First restore metadata state if available
      let restoredResponseType = null;
      let restoredProductData = null;
      let restoredProductList = [];
      
      if (search.metadata?.displayState) {
        const state = search.metadata.displayState;
        restoredResponseType = state.responseType || null;
        restoredProductData = state.productData || null;
        restoredProductList = state.productList || [];
      } else if (search.metadata) {
        restoredResponseType = search.metadata.responseType || null;
        restoredProductData = search.metadata.productData || null;
        restoredProductList = search.metadata.productList || [];
      }
      
      // Set the restored states
      setResponseType(restoredResponseType);
      setProductData(restoredProductData);
      setProductList(restoredProductList);
      
      // Restore content
      const contentToRestore = search.metadata?.streamingContent || search.response || '';
      setStreamingContent(contentToRestore);
      
      // If we have metadata but no content, we need to determine what to show
      if (!contentToRestore && restoredResponseType) {
        if (restoredResponseType === 'no_results') {
          setStreamingContent('No results found');
        } else if (restoredResponseType === 'multiple_results' && restoredProductList.length > 0) {
          setStreamingContent('');
        } else if (restoredResponseType === 'single_result' && restoredProductData) {
          setStreamingContent('');
        }
      } else if (contentToRestore && !restoredResponseType) {
        setResponseType('content_chunk');
      }
      
      // Restore document groups
      if (search.document_groups) {
        setCurrentDocumentGroups(search.document_groups);
      }
      
      // Restore query references
      originalQueryRef.current = search.metadata?.originalQuery || search.query;
      setCurrentQuery(search.query);
      
      // Complete the search to update the store
      completeSearch(search);
      
      console.log('Restored state:', {
        hasContent: !!contentToRestore,
        responseType: restoredResponseType,
        hasProductData: !!restoredProductData,
        productListCount: restoredProductList?.length || 0,
        streamingContent: contentToRestore
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteSearch = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation();
    await deleteSearchFromHistory(searchId);
  };

  const handleStarToggle = async (e: React.MouseEvent, searchId: string) => {
    e.stopPropagation();
    
    setLoadingStars(prev => new Set(prev).add(searchId));
    
    try {
      if (starredSearches.has(searchId)) {
        await starsApi.unstarSearch(searchId);
        setStarredSearches(prev => {
          const newSet = new Set(prev);
          newSet.delete(searchId);
          return newSet;
        });
        toast.success('Search removed from favorites');
      } else {
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

  // Search History Component for Sidebar
  const searchHistoryContent = (() => {
    // Deduplicate search history based on ID
    const uniqueSearchHistory = searchHistory.filter((search, index, self) =>
      index === self.findIndex((s) => s.id === search.id)
    );

    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3">
            Search History
          </h3>
          {starredSearches.size > 0 && (
            <span className="text-xs text-yellow-400">
              {starredSearches.size} starred
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 px-3">
          {uniqueSearchHistory.length === 0 ? (
            <div className="text-center py-8">
              <Search className="h-10 w-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">No search history yet</p>
            </div>
          ) : (
            <AnimatePresence>
              {uniqueSearchHistory.map((search, index) => (
                <motion.div
                  key={search.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleSelectHistoryItem(search)}
                  className={`p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all 
                           duration-200 cursor-pointer group relative ${
                             starredSearches.has(search.id) ? 'ring-1 ring-yellow-400/30' : ''
                           } ${isLoadingHistory ? 'pointer-events-none opacity-50' : ''}`}
                >
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
                        title={starredSearches.has(search.id) ? "Remove from favorites" : "Add to favorites"}
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
                        onClick={(e) => handleDeleteSearch(e, search.id)}
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
      </>
    );
  })();

  return (
    <PageLayout customSidebarContent={searchHistoryContent}>
      <div className="flex-1 flex flex-col relative">
        <AnimatePresence mode="wait">
          {!hasSearched ? (
            <motion.div
              key="initial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center px-6"
            >
              <div className="w-full max-w-4xl">
                <SearchGreeting />
                <SearchBar 
                  onSearch={handleSearch}
                  isSearching={false}
                  autoFocus={true}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col relative"
            >
              {/* New Search Button - ALWAYS ENABLED AND VISIBLE - FIXED Z-INDEX AND EVENT HANDLING */}
              <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="pointer-events-auto"
                >
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleNewSearch();
                    }}
                    disabled={isStreaming || isSearching}
                    className="shadow-lg hover:shadow-xl transition-shadow pointer-events-auto"
                    style={{ zIndex: 100 }}
                  >
                    New Search
                  </Button>
                </motion.div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pt-20 pb-32">
                <SearchResults 
                  streamingContent={streamingContent}
                  isStreaming={isStreaming}
                  stageMessage={stageMessage}
                  documentGroups={currentDocumentGroups || documentGroups}
                  responseType={responseType}
                  productData={productData}
                  productList={productList}
                  onProductSelection={handleProductSelection}
                />
              </div>

              {/* Bottom Search Bar */}
              <AnimatePresence>
                {showSearchBar && (
                  <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-12 left-0 right-0 z-30 px-6"
                  >
                    <div className="max-w-4xl mx-auto">
                      <SearchBar 
                        onSearch={handleSearch}
                        isSearching={false}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Floating Search Button - ALWAYS ENABLED */}
              {!showSearchBar && hasSearched && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowSearchBar(true)}
                  className="fixed bottom-20 right-6 w-14 h-14 bg-primary-500 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-600 transition-all z-30"
                  disabled={false}
                >
                  <Search className="h-6 w-6 text-white" />
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageLayout>
  );
};