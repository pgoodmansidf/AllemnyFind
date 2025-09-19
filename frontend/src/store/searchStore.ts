import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { searchApi, SearchResponse, SearchHistoryResponse, AgentStatus, StreamChunk, Comment } from '@/services/searchApi';
import toast from 'react-hot-toast';

interface SearchState {
  // Search state
  currentQuery: string;
  isSearching: boolean;
  searchResults: SearchResponse | null;
  streamingContent: string;
  searchHistory: SearchResponse[];
  
  // UI state
  showHistory: boolean;
  includeOnline: boolean;
  
  // Agent status
  agentStatus: AgentStatus | null;
  isConnected: boolean;
  
  // Search session
  currentSessionId: string | null;
  searchCount: number;
  
  // Actions
  setCurrentQuery: (query: string) => void;
  setIncludeOnline: (include: boolean) => void;
  setShowHistory: (show: boolean) => void;
  performSearch: (query: string) => Promise<void>;
  addStreamChunk: (chunk: StreamChunk) => void;
  completeSearch: (result: SearchResponse) => void;
  clearStreamingContent: () => void;
  loadSearchHistory: () => Promise<void>;
  deleteSearchFromHistory: (searchId: string) => Promise<void>;
  checkAgentStatus: () => Promise<void>;
  testConnection: () => Promise<void>;
  clearSearchResults: () => void;
  resetSearch: () => void;
  addComment: (searchId: string, comment: string) => Promise<void>;
  deleteComment: (searchId: string, commentId: string) => Promise<void>;
  loadCommentsForSearch: (searchId: string) => Promise<void>;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentQuery: '',
      isSearching: false,
      searchResults: null,
      streamingContent: '',
      searchHistory: [],
      showHistory: false,
      includeOnline: false,
      agentStatus: null,
      isConnected: false,
      currentSessionId: null,
      searchCount: 0,

      // Actions
      setCurrentQuery: (query: string) => {
        set({ currentQuery: query });
      },

      setIncludeOnline: (include: boolean) => {
        set({ includeOnline: include });
      },

      setShowHistory: (show: boolean) => {
        set({ showHistory: show });
      },

      performSearch: async (query: string) => {
        try {
          set({
            isSearching: true,
            currentQuery: query,
            streamingContent: '',
            searchResults: null
          });

          const request = {
            query,
            include_online: get().includeOnline,
            session_id: get().currentSessionId
          };

          const result = await searchApi.performSearch(request);

          set({
            searchResults: result,
            isSearching: false,
            searchCount: get().searchCount + 1
          });

          // Add to history with deduplication
          const currentHistory = get().searchHistory || [];
          const normalizedQuery = query?.toLowerCase()?.trim() || '';
          const isDuplicate = normalizedQuery && currentHistory.some(
            (historyItem) => historyItem?.query?.toLowerCase()?.trim() === normalizedQuery
          );

          if (!isDuplicate) {
            set({
              searchHistory: [result, ...currentHistory.slice(0, 19)] // Keep last 20
            });
          } else {
            // Update existing search result if duplicate query found
            const updatedHistory = currentHistory.map(
              (historyItem) =>
                historyItem?.query?.toLowerCase()?.trim() === normalizedQuery
                  ? { ...result, timestamp: new Date().toISOString() }
                  : historyItem
            );
            set({
              searchHistory: updatedHistory
            });
          }

        } catch (error) {
          console.error('Search failed:', error);
          set({ isSearching: false });
          toast.error('Search failed');
        }
      },

      addStreamChunk: (chunk: StreamChunk) => {
        const currentContent = get().streamingContent;
        
        if (chunk.type === 'content_chunk' && chunk.content) {
          set({
            streamingContent: currentContent + chunk.content
          });
        } else if (chunk.type === 'content_complete' && chunk.content) {
          // Handle complete content
          set({
            streamingContent: chunk.content
          });
        }
      },

      completeSearch: (result: SearchResponse) => {
        set({
          searchResults: result,
          isSearching: false,
          searchCount: get().searchCount + 1
        });

        // Add to history with deduplication
        const currentHistory = get().searchHistory || [];
        const normalizedQuery = result?.query?.toLowerCase()?.trim() || '';
        const isDuplicate = normalizedQuery && currentHistory.some(
          (historyItem) => historyItem?.query?.toLowerCase()?.trim() === normalizedQuery
        );

        if (!isDuplicate) {
          set({
            searchHistory: [result, ...currentHistory.slice(0, 19)] // Keep last 20
          });
        } else {
          // Update existing search result if duplicate query found
          const updatedHistory = currentHistory.map(
            (historyItem) =>
              historyItem?.query?.toLowerCase()?.trim() === normalizedQuery
                ? { ...result, timestamp: new Date().toISOString() }
                : historyItem
          );
          set({
            searchHistory: updatedHistory
          });
        }
      },

      clearStreamingContent: () => {
        set({ streamingContent: '' });
      },

      loadSearchHistory: async () => {
        try {
          const response = await searchApi.getSearchHistory(20, 0);
          set({ searchHistory: response.searches });
        } catch (error) {
          console.error('Failed to load search history:', error);
        }
      },

      deleteSearchFromHistory: async (searchId: string) => {
        try {
          await searchApi.deleteSearch(searchId);
          const currentHistory = get().searchHistory;
          set({
            searchHistory: currentHistory.filter(search => search.id !== searchId)
          });
          toast.success('Search deleted from history');
        } catch (error) {
          console.error('Failed to delete search:', error);
          toast.error('Failed to delete search');
        }
      },

      checkAgentStatus: async () => {
        try {
          const status = await searchApi.getAgentStatus();
          set({ 
            agentStatus: status,
            isConnected: status.search_agent === 'active'
          });
        } catch (error) {
          console.error('Failed to check agent status:', error);
          set({ isConnected: false });
        }
      },

      testConnection: async () => {
        try {
          const result = await searchApi.testConnection();
          set({ 
            isConnected: result.agentic_service === 'connected',
            agentStatus: result.agent_status 
          });
          
          if (result.agentic_service === 'connected') {
            toast.success('Agentic search service connected');
          } else {
            toast.error('Agentic search service unavailable');
          }
        } catch (error) {
          console.error('Connection test failed:', error);
          set({ isConnected: false });
          toast.error('Failed to connect to search service');
        }
      },

      clearSearchResults: () => {
        set({ 
          searchResults: null, 
          streamingContent: '',
          currentQuery: ''
        });
      },

      resetSearch: () => {
        set({
          currentQuery: '',
          isSearching: false,
          searchResults: null,
          streamingContent: ''
        });
      },

      addComment: async (searchId: string, comment: string) => {
        try {
          const newComment = await searchApi.addComment(searchId, comment);
          
          // Update the search in history with the new comment
          const currentHistory = get().searchHistory;
          const updatedHistory = currentHistory.map(search => {
            if (search.id === searchId) {
              return {
                ...search,
                comments: [...(search.comments || []), newComment]
              };
            }
            return search;
          });
          
          set({ searchHistory: updatedHistory });
          
          // Also update current search results if it matches
          const currentResults = get().searchResults;
          if (currentResults && currentResults.id === searchId) {
            set({
              searchResults: {
                ...currentResults,
                comments: [...(currentResults.comments || []), newComment]
              }
            });
          }
          
          toast.success('Comment added successfully');
        } catch (error) {
          console.error('Failed to add comment:', error);
          toast.error('Failed to add comment');
        }
      },

      deleteComment: async (searchId: string, commentId: string) => {
        try {
          await searchApi.deleteComment(searchId, commentId);
          
          // Update the search in history without the deleted comment
          const currentHistory = get().searchHistory;
          const updatedHistory = currentHistory.map(search => {
            if (search.id === searchId) {
              return {
                ...search,
                comments: (search.comments || []).filter(c => c.id !== commentId)
              };
            }
            return search;
          });
          
          set({ searchHistory: updatedHistory });
          
          // Also update current search results if it matches
          const currentResults = get().searchResults;
          if (currentResults && currentResults.id === searchId) {
            set({
              searchResults: {
                ...currentResults,
                comments: (currentResults.comments || []).filter(c => c.id !== commentId)
              }
            });
          }
          
          toast.success('Comment deleted');
        } catch (error) {
          console.error('Failed to delete comment:', error);
          toast.error('Failed to delete comment');
        }
      },

      loadCommentsForSearch: async (searchId: string) => {
        try {
          const comments = await searchApi.getComments(searchId);
          
          // Update the search in history with loaded comments
          const currentHistory = get().searchHistory;
          const updatedHistory = currentHistory.map(search => {
            if (search.id === searchId) {
              return {
                ...search,
                comments: comments
              };
            }
            return search;
          });
          
          set({ searchHistory: updatedHistory });
          
          // Also update current search results if it matches
          const currentResults = get().searchResults;
          if (currentResults && currentResults.id === searchId) {
            set({
              searchResults: {
                ...currentResults,
                comments: comments
              }
            });
          }
        } catch (error) {
          console.error('Failed to load comments:', error);
        }
      }
    }),
    {
      name: 'search-storage',
      partialize: (state) => ({
        includeOnline: state.includeOnline,
        showHistory: state.showHistory,
        searchHistory: state.searchHistory.slice(0, 10), // Persist only last 10
      }),
    }
  )
);