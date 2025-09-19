import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useIngestionStore } from '@/store/ingestionStore';
import { IngestionJob } from '@/services/ingestionApi';

interface JobProgress {
  jobId: string;
  progress: number;
  stage: string;
  totalFiles?: number;
  processedFiles?: number;
  currentFile?: string;
  isActive: boolean;
  error?: string;
}

interface TaskProgress {
  taskId: string;
  filename?: string;
  progress: number;
  stage: string;
  documentId?: string;
  chunksCount?: number;
  summary?: string;
  error?: string;
}

export const useJobProgress = (jobId?: string) => {
  const [jobProgress, setJobProgress] = useState<Record<string, JobProgress>>({});
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskProgress>>({});
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const { refreshJob } = useIngestionStore();

  const handleJobUpdate = useCallback((data: any) => {
    const progress: JobProgress = {
      jobId: data.job_id,
      progress: data.progress || 0,
      stage: data.stage || 'unknown',
      totalFiles: data.total_files,
      processedFiles: data.processed_files,
      currentFile: data.current_file,
      isActive: data.stage !== 'completed' && data.stage !== 'failed',
      error: data.error
    };

    setJobProgress(prev => ({
      ...prev,
      [data.job_id]: progress
    }));

    // Refresh job details when completed
    if (data.stage === 'completed' || data.stage === 'failed') {
      setTimeout(() => {
        refreshJob(data.job_id);
      }, 1000);
    }
  }, [refreshJob]);

  const handleTaskUpdate = useCallback((data: any) => {
    const progress: TaskProgress = {
      taskId: data.task_id,
      filename: data.filename,
      progress: data.progress || 0,
      stage: data.stage || 'unknown',
      documentId: data.document_id,
      chunksCount: data.chunks_count,
      summary: data.summary,
      error: data.error
    };

    setTaskProgress(prev => ({
      ...prev,
      [data.task_id]: progress
    }));
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsMonitoring(connected);
  }, []);

  const { isConnected, subscribeToJob, getJobStatus } = useWebSocket({
    onJobUpdate: handleJobUpdate,
    onTaskUpdate: handleTaskUpdate,
    onConnectionChange: handleConnectionChange,
  });

  // Subscribe to specific job if provided
  useEffect(() => {
    if (jobId && isConnected) {
      subscribeToJob(jobId);
      getJobStatus(jobId);
    }
  }, [jobId, isConnected, subscribeToJob, getJobStatus]);

  const getJobProgressData = useCallback((id: string): JobProgress | null => {
    return jobProgress[id] || null;
  }, [jobProgress]);

  const getActiveJobs = useCallback((): JobProgress[] => {
    return Object.values(jobProgress).filter(job => job.isActive);
  }, [jobProgress]);

  const getTasksForJob = useCallback((id: string): TaskProgress[] => {
    // This would need to be enhanced based on how tasks are linked to jobs
    return Object.values(taskProgress);
  }, [taskProgress]);

  const clearJobProgress = useCallback((id: string) => {
    setJobProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[id];
      return newProgress;
    });
  }, []);

  return {
    jobProgress: jobId ? getJobProgressData(jobId) : null,
    allJobProgress: jobProgress,
    taskProgress,
    isConnected,
    isMonitoring,
    getJobProgressData,
    getActiveJobs,
    getTasksForJob,
    clearJobProgress,
    subscribeToJob,
  };
};