import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2,
  Eye,
  Play,
  MoreVertical,
  Calendar,
  Clock,
  FileText,
  Database,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Activity,
  Filter,
  Search,
  Download
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIngestionStore } from '@/store/ingestionStore';
import { IngestionJob } from '@/services/ingestionApi';

export const JobManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<IngestionJob | null>(null);

  const {
    jobs,
    loadJobs,
    startJob,
    deleteJob,
    loadJobDetails,
    loadJobStatistics,
    jobStatistics,
    isLoading
  } = useIngestionStore();

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.main_tag.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleStartJob = async (jobId: string) => {
    const success = await startJob(jobId);
    if (success) {
      // Refresh jobs to get updated status
      await loadJobs();
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    // Always delete with cascade=true to remove associated documents
    const success = await deleteJob(jobId, true);
    if (success) {
      setShowDeleteModal(null);
    }
  };

  const handleViewJob = async (job: IngestionJob) => {
    setSelectedJob(job);
    await loadJobDetails(job.id);
    await loadJobStatistics(job.id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-400" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-white/60" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Job Management</h2>
        <div className="flex items-center space-x-3">
          <span className="text-white/70 text-sm">
            {filteredJobs.length} of {jobs.length} jobs
          </span>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-8 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value} className="bg-gray-800">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Jobs List */}
      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Database className="h-16 w-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {jobs.length === 0 ? 'No Jobs Found' : 'No Matching Jobs'}
            </h3>
            <p className="text-white/70">
              {jobs.length === 0
                ? 'Create your first ingestion job to get started'
                : 'Try adjusting your search or filter criteria'
              }
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredJobs.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="flex-shrink-0">
                        {getStatusIcon(job.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-white truncate">
                            {job.name}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                            {job.status.toUpperCase()}
                          </span>
                        </div>

                        {job.description && (
                          <p className="text-white/70 text-sm mb-3 line-clamp-2">
                            {job.description}
                          </p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-white/60">Created:</span>
                            <p className="text-white font-medium">
                              {formatDate(job.created_at)}
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Files:</span>
                            <p className="text-white font-medium">
                              {job.total_files || 0}
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Progress:</span>
                            <p className="text-white font-medium">
                              {job.progress.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Duration:</span>
                            <p className="text-white font-medium">
                              {job.started_at
                                ? formatDuration(job.started_at, job.completed_at)
                                : 'Not started'
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4 mt-3 text-xs text-white/60">
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

                    {/* Actions */}
                    <div className="flex items-center space-x-2">
                      {job.status === 'pending' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleStartJob(job.id)}
                          loading={isLoading}
                          icon={<Play className="h-4 w-4" />}
                        >
                          Start
                        </Button>
                      )}
                      
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => handleViewJob(job)}
                        icon={<Eye className="h-4 w-4" />}
                      >
                        View
                      </Button>

                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => setShowDeleteModal(job.id)}
                        icon={<Trash2 className="h-4 w-4" />}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <motion.div
                        className={`h-full rounded-full ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          job.status === 'running' ? 'bg-blue-500' :
                          'bg-yellow-500'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${job.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>

                  {/* Statistics */}
                  {(job.status === 'running' || job.status === 'completed') && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-white/10">
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
                  )}

                  {/* Error Message */}
                  {job.error_message && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-red-400 text-sm">{job.error_message}</p>
                      </div>
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
                        <Activity className="h-4 w-4 text-blue-400" />
                        <span className="text-blue-400 text-sm font-medium">Processing in real-time</span>
                      </div>
                      <p className="text-blue-300/70 text-sm mt-1">
                        Updates are being received live via WebSocket connection
                      </p>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Delete Ingestion Job</h3>
                    <p className="text-white/70 text-sm">This action cannot be undone</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <p className="text-yellow-400 text-sm">
                        <strong>Warning:</strong> Deleting this job will permanently remove all associated documents and their embeddings from the database. This action is irreversible.
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-white/80">
                    Are you sure you want to delete this ingestion job and all its processed data?
                  </p>
                </div>

                <div className="flex space-x-3">
                  <Button
                    variant="glass"
                    onClick={() => setShowDeleteModal(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleDeleteJob(showDeleteModal)}
                    className="flex-1 bg-red-500 hover:bg-red-600"
                    loading={isLoading}
                  >
                    Delete Job & Data
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job Details Modal */}
      <AnimatePresence>
        {selectedJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setSelectedJob(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[80vh] overflow-auto"
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Job Details</h3>
                  <div className="flex items-center space-x-3">
                    {selectedJob.status === 'pending' && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          handleStartJob(selectedJob.id);
                          setSelectedJob(null);
                        }}
                        loading={isLoading}
                        icon={<Play className="h-4 w-4" />}
                      >
                        Start Job
                      </Button>
                    )}
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => setSelectedJob(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Basic Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Name:</span>
                        <p className="text-white font-medium">{selectedJob.name}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Status:</span>
                        <p className="text-white font-medium">{selectedJob.status}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Main Tag:</span>
                        <p className="text-white font-medium">{selectedJob.main_tag}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Embedding Model:</span>
                        <p className="text-white font-medium">{selectedJob.embedding_model}</p>
                      </div>
                    </div>
                  </div>

                  {/* Statistics */}
                  {jobStatistics[selectedJob.id] && (
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-3">Statistics</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-white/60">Total Files:</span>
                          <p className="text-white font-medium">{selectedJob.total_files || 0}</p>
                        </div>
                        <div>
                          <span className="text-white/60">Processed:</span>
                          <p className="text-white font-medium text-green-400">{selectedJob.processed_files || 0}</p>
                        </div>
                        <div>
                          <span className="text-white/60">Failed:</span>
                          <p className="text-white font-medium text-red-400">{selectedJob.failed_files || 0}</p>
                        </div>
                        <div>
                          <span className="text-white/60">Skipped:</span>
                          <p className="text-white font-medium text-yellow-400">{selectedJob.skipped_files || 0}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Configuration */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Configuration</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Source Path:</span>
                        <p className="text-white font-medium break-all">{selectedJob.source_path}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Source Type:</span>
                        <p className="text-white font-medium">{selectedJob.source_type}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Chunk Size:</span>
                        <p className="text-white font-medium">{selectedJob.chunk_size} tokens</p>
                      </div>
                      <div>
                        <span className="text-white/60">Chunk Overlap:</span>
                        <p className="text-white font-medium">{selectedJob.chunk_overlap} tokens</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};