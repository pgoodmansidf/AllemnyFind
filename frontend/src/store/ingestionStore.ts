import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  IngestionJob,
  CreateIngestionJobRequest,
  OllamaModel,
  ConnectionStatus,
  DirectoryScanResult,
  JobStatistics,
  ProcessedDocument
} from '@/services/ingestionApi';
import { ingestionApi } from '@/services/ingestionApi';
import { debouncedToast, progressToast } from '@/utils/toastDebounce';

interface IngestionState {
  // Jobs
  jobs: IngestionJob[];
  currentJob: IngestionJob | null;
  isLoading: boolean;

  // Documents
  documents: ProcessedDocument[];
  currentDocument: ProcessedDocument | null;
  isLoadingDocuments: boolean;

  // Models and configuration
  ollamaModels: OllamaModel[];
  selectedEmbeddingModel: string;
  groqApiKey: string;

  // Directory scanning
  currentScanResult: DirectoryScanResult | null;
  selectedPath: string;

  // Connection status
  connectionStatus: ConnectionStatus | null;

  // Statistics
  jobStatistics: Record<string, JobStatistics>;

  // Redis and System Management
  redisHealth: any;
  redisStats: any;
  systemInfo: any;
  processingMode: string;

  // Job Actions
  loadJobs: () => Promise<void>;
  createJob: (request: CreateIngestionJobRequest) => Promise<boolean>;
  startJob: (jobId: string) => Promise<boolean>;
  deleteJob: (jobId: string, cascade?: boolean) => Promise<boolean>;
  loadJobDetails: (jobId: string) => Promise<void>;
  loadJobStatistics: (jobId: string) => Promise<void>;

  // Document Actions
  loadDocuments: (jobId?: string, statusFilter?: string) => Promise<void>;
  loadDocumentDetails: (documentId: string) => Promise<void>;

  // Directory operations
  scanDirectory: (path: string, options?: any) => Promise<boolean>;
  validatePath: (path: string) => Promise<boolean>;
  setSelectedPath: (path: string) => void;

  // Model management
  loadOllamaModels: () => Promise<void>;
  setSelectedEmbeddingModel: (model: string) => void;
  setGroqApiKey: (apiKey: string) => void;

  // Connection testing
  testConnections: () => Promise<void>;

  // Redis and System Management
  getRedisHealth: () => Promise<void>;
  getRedisStats: () => Promise<void>;
  clearRedisCache: (pattern?: string, confirm?: boolean) => Promise<boolean>;
  clearIngestionCache: (jobId?: string, confirm?: boolean) => Promise<boolean>;
  getSystemInfo: () => Promise<void>;
  getProcessingMode: () => Promise<void>;
  setProcessingMode: (mode: string) => Promise<boolean>;

  // Utilities
  clearError: () => void;
  refreshJob: (jobId: string) => Promise<void>;
}

export const useIngestionStore = create<IngestionState>()(
  persist(
    (set, get) => ({
      // Initial state
      jobs: [],
      currentJob: null,
      isLoading: false,
      documents: [],
      currentDocument: null,
      isLoadingDocuments: false,
      ollamaModels: [],
      selectedEmbeddingModel: 'nomic-embed-text',
      groqApiKey: '',
      currentScanResult: null,
      selectedPath: '',
      connectionStatus: null,
      jobStatistics: {},
      redisHealth: null,
      redisStats: null,
      systemInfo: null,
      processingMode: 'native',

      // Job management actions
      loadJobs: async () => {
        try {
          set({ isLoading: true });
          const jobs = await ingestionApi.getIngestionJobs();
          set({ jobs, isLoading: false });
        } catch (error) {
          console.error('Error loading jobs:', error);
          set({ isLoading: false });
        }
      },

      createJob: async (request: CreateIngestionJobRequest): Promise<boolean> => {
        try {
          set({ isLoading: true });
          const job = await ingestionApi.createIngestionJob(request);
          const currentJobs = get().jobs;
          set({
            jobs: [job, ...currentJobs],
            currentJob: job,
            isLoading: false
          });
          debouncedToast.success(`Ingestion job "${job.name}" created successfully!`);
          return true;
        } catch (error) {
          console.error('Error creating job:', error);
          set({ isLoading: false });
          return false;
        }
      },

      startJob: async (jobId: string): Promise<boolean> => {
        try {
          set({ isLoading: true });
          await ingestionApi.startIngestionJob(jobId);
          
          // Update job status in local state
          const currentJobs = get().jobs;
          const updatedJobs = currentJobs.map(job => 
            job.id === jobId ? { ...job, status: 'running' as const } : job
          );
          set({ jobs: updatedJobs, isLoading: false });
          
          const job = currentJobs.find(j => j.id === jobId);
          progressToast.showProgress(jobId, `Started processing "${job?.name || 'job'}"`);
          return true;
        } catch (error) {
          console.error('Error starting job:', error);
          set({ isLoading: false });
          return false;
        }
      },

      deleteJob: async (jobId: string, cascade: boolean = true): Promise<boolean> => {
        try {
          await ingestionApi.deleteIngestionJob(jobId, cascade);
          const currentJobs = get().jobs;
          set({
            jobs: currentJobs.filter(job => job.id !== jobId),
            currentJob: get().currentJob?.id === jobId ? null : get().currentJob
          });
          debouncedToast.success('Ingestion job deleted successfully!');
          return true;
        } catch (error) {
          console.error('Error deleting job:', error);
          return false;
        }
      },

      loadJobDetails: async (jobId: string) => {
        try {
          const job = await ingestionApi.getIngestionJob(jobId);
          set({ currentJob: job });
        } catch (error) {
          console.error('Error loading job details:', error);
        }
      },

      loadJobStatistics: async (jobId: string) => {
        try {
          const stats = await ingestionApi.getJobStatistics(jobId);
          const currentStats = get().jobStatistics;
          set({
            jobStatistics: { ...currentStats, [jobId]: stats }
          });
        } catch (error) {
          console.error('Error loading job statistics:', error);
        }
      },

      // Document management actions
      loadDocuments: async (jobId?: string, statusFilter?: string) => {
        try {
          set({ isLoadingDocuments: true });
          const documents = await ingestionApi.getProcessedDocuments(0, 100, jobId, statusFilter);
          set({ documents, isLoadingDocuments: false });
        } catch (error) {
          console.error('Error loading documents:', error);
          set({ isLoadingDocuments: false });
        }
      },

      loadDocumentDetails: async (documentId: string) => {
        try {
          const document = await ingestionApi.getProcessedDocument(documentId);
          set({ currentDocument: document });
        } catch (error) {
          console.error('Error loading document details:', error);
        }
      },

      // Directory operations
      scanDirectory: async (path: string, options: any = {}): Promise<boolean> => {
        try {
          set({ isLoading: true });
          const scanRequest = {
            path,
            recursive: true,
            max_files: 1000,
            ...options
          };
          const result = await ingestionApi.scanDirectory(scanRequest);
          set({
            currentScanResult: result,
            selectedPath: path,
            isLoading: false
          });
          if (result.success) {
            debouncedToast.success(`Found ${result.total_files} supported files`);
            return true;
          } else {
            debouncedToast.error('Directory scan failed');
            return false;
          }
        } catch (error) {
          console.error('Error scanning directory:', error);
          set({ isLoading: false });
          return false;
        }
      },

      validatePath: async (path: string): Promise<boolean> => {
        try {
          const result = await ingestionApi.validatePath(path);
          if (result.success && result.accessible) {
            debouncedToast.success('Path is valid and accessible');
            return true;
          } else {
            debouncedToast.error(result.error || 'Path is not accessible');
            return false;
          }
        } catch (error) {
          console.error('Error validating path:', error);
          return false;
        }
      },

      setSelectedPath: (path: string) => {
        set({ selectedPath: path });
      },

      // Model management
      loadOllamaModels: async () => {
        try {
          const response = await ingestionApi.getOllamaModels();
          if (response.success) {
            set({ ollamaModels: response.models });
            // Set default model if none selected
            const currentModel = get().selectedEmbeddingModel;
            const embeddingModels = response.models.filter(m => m.is_embedding_model);
            if (!currentModel && embeddingModels.length > 0) {
              set({ selectedEmbeddingModel: embeddingModels[0].name });
            }
          }
        } catch (error) {
          console.error('Error loading Ollama models:', error);
        }
      },

      setSelectedEmbeddingModel: (model: string) => {
        set({ selectedEmbeddingModel: model });
      },

      setGroqApiKey: (apiKey: string) => {
        set({ groqApiKey: apiKey });
      },

      // Connection testing
      testConnections: async () => {
        try {
          const status = await ingestionApi.testConnections();
          set({ connectionStatus: status });
          if (status.overall_status === 'connected') {
            debouncedToast.success('All services connected successfully!');
          } else {
            debouncedToast.error('Some services are not available');
          }
        } catch (error) {
          console.error('Error testing connections:', error);
        }
      },

      // Redis and System Management
      getRedisHealth: async () => {
        try {
          const response = await fetch('/api/v1/ingestion/redis/health', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });

          if (response.ok) {
            const health = await response.json();
            set({ redisHealth: health });
          }
        } catch (error) {
          console.error('Error fetching Redis health:', error);
        }
      },

      getRedisStats: async () => {
        try {
          const response = await fetch('/api/v1/ingestion/redis/stats', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });

          if (response.ok) {
            const stats = await response.json();
            set({ redisStats: stats });
          }
        } catch (error) {
          console.error('Error fetching Redis stats:', error);
        }
      },

      clearRedisCache: async (pattern: string = '*', confirm: boolean = false): Promise<boolean> => {
        try {
          const response = await fetch('/api/v1/ingestion/redis/clear-cache', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ pattern, confirm })
          });

          if (response.ok) {
            const result = await response.json();
            debouncedToast.success(`${result.message} (${result.deleted_count} keys deleted)`);
            return true;
          } else {
            const error = await response.json();
            debouncedToast.error(error.detail || 'Failed to clear cache');
            return false;
          }
        } catch (error) {
          console.error('Error clearing Redis cache:', error);
          debouncedToast.error('Error clearing cache');
          return false;
        }
      },

      clearIngestionCache: async (jobId?: string, confirm: boolean = false): Promise<boolean> => {
        try {
          const response = await fetch('/api/v1/ingestion/redis/clear-ingestion-cache', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ job_id: jobId, confirm })
          });

          if (response.ok) {
            const result = await response.json();
            debouncedToast.success(result.message);
            return true;
          } else {
            const error = await response.json();
            debouncedToast.error(error.detail || 'Failed to clear ingestion cache');
            return false;
          }
        } catch (error) {
          console.error('Error clearing ingestion cache:', error);
          debouncedToast.error('Error clearing ingestion cache');
          return false;
        }
      },

      getSystemInfo: async () => {
        try {
          const response = await fetch('/api/v1/ingestion/system/environment', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });

          if (response.ok) {
            const info = await response.json();
            set({ systemInfo: info });
          }
        } catch (error) {
          console.error('Error fetching system info:', error);
        }
      },

      getProcessingMode: async () => {
        try {
          const response = await fetch('/api/v1/ingestion/system/processing-mode', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });

          if (response.ok) {
            const mode = await response.json();
            set({ processingMode: mode.mode });
          }
        } catch (error) {
          console.error('Error fetching processing mode:', error);
        }
      },

      setProcessingMode: async (mode: string): Promise<boolean> => {
        try {
          const response = await fetch('/api/v1/ingestion/system/set-processing-mode', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ mode })
          });

          if (response.ok) {
            const result = await response.json();
            set({ processingMode: mode });
            debouncedToast.success(result.message);
            return true;
          } else {
            const error = await response.json();
            debouncedToast.error(error.detail || 'Failed to set processing mode');
            return false;
          }
        } catch (error) {
          console.error('Error setting processing mode:', error);
          debouncedToast.error('Error updating processing mode');
          return false;
        }
      },

      // Utilities
      clearError: () => {
        // For future error state management
      },

      refreshJob: async (jobId: string) => {
        await get().loadJobDetails(jobId);
        await get().loadJobStatistics(jobId);
      }
    }),
    {
      name: 'ingestion-storage',
      partialize: (state) => ({
        selectedEmbeddingModel: state.selectedEmbeddingModel,
        groqApiKey: state.groqApiKey,
        selectedPath: state.selectedPath,
      }),
    }
  )
);