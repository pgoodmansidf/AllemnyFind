import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  summarizationApi, 
  SummaryResponse, 
  DetailedSummaryResponse,
  AvailableDocument,
  SummaryStreamChunk 
} from '@/services/summarizationApi';
import toast from 'react-hot-toast';

interface SummarizationState {
  // Documents
  availableDocuments: AvailableDocument[];
  selectedDocuments: string[];
  
  // Summary state
  currentSummary: DetailedSummaryResponse | null;
  summaryHistory: SummaryResponse[];
  streamingContent: string;
  isGenerating: boolean;
  currentStage: string;
  
  // UI state
  summaryType: 'general' | 'executive' | 'research_brief';
  topic: string;
  
  // Actions
  loadAvailableDocuments: () => Promise<void>;
  toggleDocumentSelection: (documentId: string) => void;
  clearDocumentSelection: () => void;
  setSummaryType: (type: 'general' | 'executive' | 'research_brief') => void;
  setTopic: (topic: string) => void;
  generateSummary: () => Promise<void>;
  loadSummaryHistory: () => Promise<void>;
  loadSummary: (summaryId: string) => Promise<void>;
  toggleSummaryStar: (summaryId: string) => Promise<void>;
  deleteSummary: (summaryId: string) => Promise<void>;
  clearStreamingContent: () => void;
  addStreamChunk: (chunk: SummaryStreamChunk) => void;
  setCurrentSummary: (summary: DetailedSummaryResponse | null) => void;
}

export const useSummarizationStore = create<SummarizationState>()(
  persist(
    (set, get) => ({
      // Initial state
      availableDocuments: [],
      selectedDocuments: [],
      currentSummary: null,
      summaryHistory: [],
      streamingContent: '',
      isGenerating: false,
      currentStage: '',
      summaryType: 'general',
      topic: '',

      // Load available documents
      loadAvailableDocuments: async () => {
        try {
          const documents = await summarizationApi.getAvailableDocuments();
          set({ availableDocuments: documents });
        } catch (error) {
          console.error('Failed to load documents:', error);
          toast.error('Failed to load available documents');
        }
      },

      // Toggle document selection
      toggleDocumentSelection: (documentId: string) => {
        const current = get().selectedDocuments;
        if (current.includes(documentId)) {
          set({ selectedDocuments: current.filter(id => id !== documentId) });
        } else {
          if (current.length >= 20) {
            toast.error('Maximum 20 documents can be selected');
            return;
          }
          set({ selectedDocuments: [...current, documentId] });
        }
      },

      // Clear document selection
      clearDocumentSelection: () => {
        set({ selectedDocuments: [] });
      },

      // Set summary type
      setSummaryType: (type: 'general' | 'executive' | 'research_brief') => {
        set({ summaryType: type });
      },

      // Set topic
      setTopic: (topic: string) => {
        set({ topic });
      },

      // Generate summary
      generateSummary: async () => {
        const { selectedDocuments, summaryType, topic } = get();
        
        if (selectedDocuments.length === 0) {
          toast.error('Please select at least one document');
          return;
        }

        set({ 
          isGenerating: true, 
          streamingContent: '',
          currentStage: 'Initializing...',
          currentSummary: null
        });

        const abortController = new AbortController();

        try {
          await summarizationApi.streamSummarization(
            {
              document_ids: selectedDocuments,
              summary_type: summaryType,
              topic: topic || undefined
            },
            (chunk: SummaryStreamChunk) => {
              get().addStreamChunk(chunk);
            },
            abortController.signal
          );
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('Summarization failed:', error);
            toast.error('Failed to generate summary');
          }
          set({ isGenerating: false, currentStage: '' });
        }
      },

      // Add stream chunk
      addStreamChunk: (chunk: SummaryStreamChunk) => {
        const currentContent = get().streamingContent;
        
        switch (chunk.type) {
          case 'stage_update':
            set({ currentStage: chunk.message || '' });
            break;
            
          case 'content_chunk':
            if (chunk.content) {
              set({ streamingContent: currentContent + chunk.content });
            }
            break;
            
          case 'summary_complete':
            set({ 
              isGenerating: false,
              currentStage: ''
            });
            
            // Load the completed summary
            if (chunk.summary_id) {
              // Load summary without clearing streaming content yet
              summarizationApi.getSummary(chunk.summary_id).then((summary) => {
                set({ 
                  currentSummary: summary,
                  streamingContent: summary.full_summary || get().streamingContent
                });
              }).catch((error) => {
                console.error('Failed to load completed summary:', error);
              });
              
              get().loadSummaryHistory();
            }
            
            const time = ((chunk.processing_time || 0) / 1000).toFixed(1);
            toast.success(`Summary generated in ${time}s`);
            break;
            
          case 'error':
            set({ 
              isGenerating: false,
              currentStage: ''
            });
            toast.error(chunk.message || 'Summarization error');
            break;
        }
      },

      // Load summary history
      loadSummaryHistory: async () => {
        try {
          const history = await summarizationApi.getSummaryHistory(20);
          set({ summaryHistory: history });
        } catch (error) {
          console.error('Failed to load summary history:', error);
        }
      },

      // Load specific summary
      loadSummary: async (summaryId: string) => {
        try {
          const summary = await summarizationApi.getSummary(summaryId);
          set({ 
            currentSummary: summary,
            streamingContent: summary.full_summary || ''
          });
        } catch (error) {
          console.error('Failed to load summary:', error);
          toast.error('Failed to load summary');
          throw error;
        }
      },

      // Toggle star
      toggleSummaryStar: async (summaryId: string) => {
        try {
          const isStarred = await summarizationApi.toggleStar(summaryId);
          
          // Update in history
          const history = get().summaryHistory;
          set({
            summaryHistory: history.map(s => 
              s.id === summaryId ? { ...s, is_starred: isStarred } : s
            )
          });
          
          // Update current if it matches
          const current = get().currentSummary;
          if (current && current.id === summaryId) {
            set({
              currentSummary: { ...current, is_starred: isStarred }
            });
          }
          
          toast.success(isStarred ? 'Summary starred' : 'Star removed');
        } catch (error) {
          console.error('Failed to toggle star:', error);
          toast.error('Failed to update star status');
        }
      },

      // Delete summary
      deleteSummary: async (summaryId: string) => {
        try {
          await summarizationApi.deleteSummary(summaryId);
          
          // Remove from history
          const history = get().summaryHistory;
          set({
            summaryHistory: history.filter(s => s.id !== summaryId)
          });
          
          // Clear current if it matches
          const current = get().currentSummary;
          if (current && current.id === summaryId) {
            set({
              currentSummary: null,
              streamingContent: ''
            });
          }
          
          toast.success('Summary deleted');
        } catch (error) {
          console.error('Failed to delete summary:', error);
          toast.error('Failed to delete summary');
        }
      },

      // Clear streaming content
      clearStreamingContent: () => {
        set({ 
          streamingContent: '',
          currentSummary: null
        });
      },

      // Set current summary
      setCurrentSummary: (summary: DetailedSummaryResponse | null) => {
        set({ currentSummary: summary });
      }
    }),
    {
      name: 'summarization-storage',
      partialize: (state) => ({
        summaryType: state.summaryType,
        selectedDocuments: state.selectedDocuments
      }),
    }
  )
);