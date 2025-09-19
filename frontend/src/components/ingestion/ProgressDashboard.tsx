import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  FileText, 
  Database,
  Activity,
  Zap,
  TrendingUp
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useIngestionStore } from '@/store/ingestionStore';
import { useJobProgress } from '@/hooks/useJobProgress';
import { IngestionJob } from '@/services/ingestionApi';

interface ProgressDashboardProps {
  jobs?: IngestionJob[];
  showAll?: boolean;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  jobs = [],
  showAll = false
}) => {
  const { jobs: allJobs, loadJobs } = useIngestionStore();
  const { getActiveJobs, isConnected, isMonitoring } = useJobProgress();

  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string;
    type: 'start' | 'progress' | 'complete' | 'error';
    message: string;
    timestamp: Date;
    jobId?: string;
  }>>([]);

  useEffect(() => {
    // Load jobs initially
    loadJobs();

    // Set up periodic refresh
    const interval = setInterval(() => {
      loadJobs();
    }, 5000); // Refresh every 5 seconds

    setRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadJobs]);

  const displayJobs = showAll ? allJobs : jobs;
  const activeJobs = getActiveJobs();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-5 w-5 text-blue-400" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-400" />;
      default:
        return <Activity className="h-5 w-5 text-white/60" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'from-blue-500 to-blue-600';
      case 'completed':
        return 'from-green-500 to-green-600';
      case 'failed':
        return 'from-red-500 to-red-600';
      case 'pending':
        return 'from-yellow-500 to-yellow-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const JobProgressBar: React.FC<{ job: IngestionJob }> = ({ job }) => {
    const progressData = useJobProgress(job.id).jobProgress;
    const progress = progressData?.progress || job.progress || 0;
    const isActive = job.status === 'running' || job.status === 'pending';

    return (
      <div className="space-y-2">
        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden relative">
          <motion.div
            className={`h-full bg-gradient-to-r ${getStatusColor(job.status)} relative`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {isActive && (
              <motion.div
                className="absolute inset-0 bg-white/20"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              />
            )}
          </motion.div>

          {/* Progress percentage overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-white/90 drop-shadow-sm">
              {progress.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Enhanced progress details */}
        {(isActive && progressData) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {progressData.currentFile && (
              <div className="col-span-2">
                <span className="text-white/60">Processing:</span>
                <p className="text-white truncate font-mono">
                  {progressData.currentFile}
                </p>
              </div>
            )}

            <div>
              <span className="text-white/60">Speed:</span>
              <p className="text-white font-medium">
                {progressData.filesPerMinute ? `${progressData.filesPerMinute.toFixed(1)} f/min` : 'Calculating...'}
              </p>
            </div>

            <div>
              <span className="text-white/60">ETA:</span>
              <p className="text-white font-medium">
                {progressData.eta ? formatDuration(0, progressData.eta) : 'Calculating...'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <div>
              <h4 className="text-white font-medium">Real-time Updates</h4>
              <p className="text-white/70 text-sm">
                {isConnected 
                  ? 'Connected - Receiving live progress updates'
                  : 'Disconnected - Updates may be delayed'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-white/70">
            <Activity className="h-4 w-4" />
            <span>{activeJobs.length} active</span>
          </div>
        </div>
      </GlassCard>

      {/* Active Jobs Summary */}
      {activeJobs.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <GlassCard className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Play className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white/70 text-sm">Active Jobs</p>
                  <p className="text-2xl font-bold text-white">{activeJobs.length}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white/70 text-sm">Files Processing</p>
                  <p className="text-2xl font-bold text-white">
                    {activeJobs.reduce((sum, job) => sum + (job.processedFiles || 0), 0)}
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-white/70 text-sm">Avg Progress</p>
                  <p className="text-2xl font-bold text-white">
                    {activeJobs.length > 0
                      ? Math.round(activeJobs.reduce((sum, job) => sum + job.progress, 0) / activeJobs.length)
                      : 0
                    }%
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Real-time Activity Feed */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Live Activity</span>
              </h4>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className="text-xs text-white/60">
                  {isConnected ? 'Live' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto">
              {recentActivities.slice(0, 5).map((activity) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center space-x-3 p-2 bg-white/5 rounded-lg"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    activity.type === 'start' ? 'bg-blue-400' :
                    activity.type === 'progress' ? 'bg-yellow-400' :
                    activity.type === 'complete' ? 'bg-green-400' :
                    'bg-red-400'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/90 text-sm truncate">{activity.message}</p>
                    <p className="text-white/50 text-xs">
                      {activity.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </motion.div>
              ))}

              {recentActivities.length === 0 && (
                <div className="text-center py-4 text-white/50 text-sm">
                  No recent activity
                </div>
              )}
            </div>
          </GlassCard>
        </>
      )}

      {/* Job List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">
            {showAll ? 'All Jobs' : 'Recent Jobs'}
          </h3>
          {!showAll && displayJobs.length > 5 && (
            <Button variant="glass" size="sm">
              View All
            </Button>
          )}
        </div>

        <AnimatePresence>
          {displayJobs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Database className="h-16 w-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Jobs Found</h3>
              <p className="text-white/70">
                Create your first ingestion job to get started
              </p>
            </motion.div>
          ) : (
            displayJobs.slice(0, showAll ? undefined : 5).map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        {getStatusIcon(job.status)}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-white">{job.name}</h4>
                        {job.description && (
                          <p className="text-white/70 text-sm mt-1">{job.description}</p>
                        )}
                        <div className="flex items-center space-x-4 mt-2 text-sm text-white/60">
                          <span className="flex items-center space-x-1">
                            <Database className="h-3 w-3" />
                            <span>{job.embedding_model}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <FileText className="h-3 w-3" />
                            <span>{job.main_tag}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        job.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        job.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                        job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {job.status.toUpperCase()}
                      </div>
                      {job.started_at && (
                        <p className="text-white/60 text-xs mt-1">
                          {formatDuration(job.started_at, job.completed_at)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/70 text-sm">Progress</span>
                      <span className="text-white text-sm font-medium">{job.progress.toFixed(1)}%</span>
                    </div>
                    <JobProgressBar job={job} />
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-white/60">Total Files</p>
                      <p className="text-white font-medium">{job.total_files || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60">Processed</p>
                      <p className="text-white font-medium text-green-400">{job.processed_files || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60">Failed</p>
                      <p className="text-white font-medium text-red-400">{job.failed_files || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60">Skipped</p>
                      <p className="text-white font-medium text-yellow-400">{job.skipped_files || 0}</p>
                    </div>
                  </div>

                  {/* Error Message */}
                  {job.error_message && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-red-400 text-sm">{job.error_message}</p>
                    </div>
                  )}

                  {/* Real-time Progress Info */}
                  {job.status === 'running' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
                    >
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span className="text-blue-400 text-sm font-medium">Processing in real-time</span>
                      </div>
                      <p className="text-blue-300/70 text-sm mt-1">
                        Updates are being received live via WebSocket connection
                      </p>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};