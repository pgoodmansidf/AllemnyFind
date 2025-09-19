// useSearchSSE.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { searchApi } from '@/services/searchApi';
import { useAuthStore } from '@/store/authStore';

type StageUpdateChunk = { type: 'stage_update'; message?: string };
type ContentChunk = { type: 'content_chunk'; content: string };
type ContentCompleteChunk = { type: 'content_complete'; content: string };
type DocumentGroupsChunk = { type: 'document_groups'; groups: Record<string, any[]> };
type SingleResultChunk = { type: 'single_result'; data: any; metadata?: Record<string, any> };
type MultipleResultsChunk = { type: 'multiple_results'; products: any[]; metadata?: Record<string, any> };
type NoResultsChunk = { type: 'no_results'; message?: string };
type SearchCompleteChunk = {
  type: 'search_complete';
  processing_time?: number;
  document_groups?: Record<string, any[]>;
  content?: string;
  metadata?: Record<string, any>;
};
type ErrorChunk = { type: 'error'; message?: string };

type SearchStartedChunk = { type: 'search_started' };

export type ExtendedStreamChunk =
  | SearchStartedChunk
  | StageUpdateChunk
  | ContentChunk
  | ContentCompleteChunk
  | DocumentGroupsChunk
  | SingleResultChunk
  | MultipleResultsChunk
  | NoResultsChunk
  | SearchCompleteChunk
  | ErrorChunk;

type UseSearchSSEOptions = {
  onStreamChunk?: (chunk: ExtendedStreamChunk) => void;
  onDocumentGroups?: (groups: Record<string, any[]>) => void;
  onSearchComplete?: (processingTime: number, documentGroups?: Record<string, any[]>) => void;
  onError?: (message: string) => void;
  onSingleResult?: (data: any) => void;
  onMultipleResults?: (products: any[]) => void;
  onNoResults?: (message: string) => void;
};

export function useSearchSSE(options: UseSearchSSEOptions) {
  const {
    onStreamChunk,
    onDocumentGroups,
    onSearchComplete,
    onError,
    onSingleResult,
    onMultipleResults,
    onNoResults,
  } = options;

  const { user } = useAuthStore();

  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [documentGroups, setDocumentGroups] = useState<Record<string, any[]>>({});
  const [currentResponseType, setCurrentResponseType] = useState<string | null>(null);
  const [productData, setProductData] = useState<any>(null);
  const [productList, setProductList] = useState<any[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastToastRef = useRef<{ message: string; time: number } | null>(null);

  // Debounced toast (prevents spam)
  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const now = Date.now();
    const last = lastToastRef.current;
    if (last && last.message === message && now - last.time < 2000) return;
    lastToastRef.current = { message, time: now };
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast(message);
  }, []);

  // Connection check
  const checkConnection = useCallback(async () => {
    try {
      const result = await searchApi.testConnection();
      const connected = result.agentic_service === 'connected';
      setIsConnected(connected);
      return connected;
    } catch {
      setIsConnected(false);
      return false;
    }
  }, []);

  // Main search
  const performSearch = useCallback(
    async (
      query: string,
      includeOnline: boolean = false,
      filters?: any,
      selectedProduct?: string
    ) => {
      if (!user) {
        showToast('error', 'User not authenticated');
        return false;
      }

      // Cancel any ongoing search
      if (abortControllerRef.current) abortControllerRef.current.abort();

      // Start new one
      abortControllerRef.current = new AbortController();
      setIsSearching(true);

      // Reset state for a clean run
      setDocumentGroups({});
      setCurrentResponseType(null);
      setProductData(null);
      setProductList([]);

      try {
        await searchApi.streamSearch(
          {
            query,
            include_online: includeOnline,
            filters,
            selected_product: selectedProduct,
          },
          (chunk: ExtendedStreamChunk) => {
            // Fan-out to page for UI
            const emit = (c: ExtendedStreamChunk) => onStreamChunk && onStreamChunk(c);

            switch (chunk.type) {
              case 'search_started':
                emit(chunk);
                break;

              case 'stage_update':
                emit(chunk);
                break;

              case 'content_chunk':
                emit(chunk);
                break;

              case 'content_complete':
                emit(chunk);
                break;

              case 'document_groups': {
                if (chunk.groups) {
                  setDocumentGroups(chunk.groups);
                  onDocumentGroups && onDocumentGroups(chunk.groups);
                  emit(chunk);
                }
                break;
              }

              case 'single_result': {
                setCurrentResponseType('single_result');
                setProductData(chunk.data);
                setProductList([]);
                setIsSearching(false);
                onSingleResult && onSingleResult(chunk.data);
                emit({ ...chunk, type: 'single_result' });
                break;
              }

              case 'multiple_results': {
                setCurrentResponseType('multiple_results');
                setProductList(chunk.products || []);
                setProductData(null);
                setIsSearching(false);
                onMultipleResults && onMultipleResults(chunk.products || []);
                emit({ ...chunk, type: 'multiple_results' });
                break;
              }

              case 'no_results': {
                // Properly end the searching state
                setCurrentResponseType('no_results');
                setProductData(null);
                setProductList([]);
                setIsSearching(false);
                onNoResults && onNoResults(chunk.message || 'No results found');
                emit({ ...chunk, type: 'no_results' });
                break;
              }

              case 'search_complete': {
                setIsSearching(false);
                if (chunk.document_groups) {
                  setDocumentGroups(chunk.document_groups);
                  onDocumentGroups && onDocumentGroups(chunk.document_groups);
                }
                onSearchComplete && onSearchComplete(chunk.processing_time || 0, chunk.document_groups);
                if (chunk.processing_time && chunk.processing_time > 5000) {
                  showToast('success', `Search completed in ${(chunk.processing_time / 1000).toFixed(1)}s`);
                }
                break;
              }

              case 'error': {
                setIsSearching(false);
                const msg = chunk.message || 'Search error occurred';
                onError && onError(msg);
                showToast('error', msg);
                break;
              }

              default: {
                // Pass through unknown chunks so UI can decide
                emit(chunk);
              }
            }
          },
          abortControllerRef.current.signal
        );

        return true;
      } catch (error: any) {
        setIsSearching(false);
        if (error?.name === 'AbortError') {
          // search was cancelled; nothing to show
          return false;
        }
        const msg = error?.message || 'Failed to perform search';
        onError && onError(msg);
        showToast('error', msg);
        return false;
      }
    },
    [user, onStreamChunk, onSearchComplete, onError, onDocumentGroups, onSingleResult, onMultipleResults, onNoResults, showToast]
  );

  // Product-specific search
  const performProductSearch = useCallback(
    async (originalQuery: string, product: string) => {
      return performSearch(originalQuery, false, undefined, product);
    },
    [performSearch]
  );

  // Abort current search
  const abortSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSearching(false);
    }
  }, []);

  // Reset search state - new method to properly reset everything
  const resetSearchState = useCallback(() => {
    setIsSearching(false);
    setCurrentResponseType(null);
    setProductData(null);
    setProductList([]);
    setDocumentGroups({});
  }, []);

  // Connectivity on mount/interval
  useEffect(() => {
    checkConnection();
    const id = setInterval(checkConnection, 60_000);
    return () => clearInterval(id);
  }, [checkConnection]);

  return {
    isConnected,
    isSearching,
    performSearch,
    performProductSearch,
    documentGroups,
    abortSearch,
    checkConnection,
    resetSearchState,
    currentResponseType,
    productData,
    productList,
  };
}