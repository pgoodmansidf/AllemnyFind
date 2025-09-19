import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Search,
  Filter,
  Eye,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Database,
  Tag,
  User,
  Calendar,
  FileCheck,
  AlertTriangle
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useIngestionStore } from '@/store/ingestionStore';
import { ProcessedDocument } from '@/services/ingestionApi';

export const DocumentsList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [selectedDocument, setSelectedDocument] = useState<ProcessedDocument | null>(null);

  const {
    documents,
    jobs,
    loadDocuments,
    loadJobDetails,
    isLoadingDocuments,
    loadJobs
  } = useIngestionStore();

  useEffect(() => {
    // Load jobs and documents when component mounts
    const loadData = async () => {
      await loadJobs();
      await loadDocuments();
    };
    loadData();
  }, [loadJobs, loadDocuments]);

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.main_tag.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || doc.processing_status === statusFilter;
    const matchesJob = jobFilter === 'all' || doc.ingestion_job_id === jobFilter;
    
    return matchesSearch && matchesStatus && matchesJob;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'embedding_pending':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'partially_completed':
        return <AlertTriangle className="h-4 w-4 text-orange-400" />;
      default:
        return <Clock className="h-4 w-4 text-white/60" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'embedding_pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'partially_completed':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'embedding_pending', label: 'Embedding Pending' },
    { value: 'partially_completed', label: 'Partially Completed' },
  ];

  const jobOptions = [
    { value: 'all', label: 'All Jobs' },
    ...jobs.map(job => ({ value: job.id, label: job.name }))
  ];

  const handleViewDocument = async (document: ProcessedDocument) => {
    setSelectedDocument(document);
  };

  const handleRefreshDocuments = async () => {
    await loadDocuments();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Processed Documents</h2>
        <div className="flex items-center space-x-3">
          <Button
            variant="glass"
            size="sm"
            onClick={handleRefreshDocuments}
            loading={isLoadingDocuments}
            icon={<Database className="h-4 w-4" />}
          >
            Refresh
          </Button>
          <span className="text-white/70 text-sm">
            {filteredDocuments.length} of {documents.length} documents
          </span>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <input
                type="text"
                placeholder="Search documents..."
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

            <div className="relative">
              <Database className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                className="pl-10 pr-8 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
              >
                {jobOptions.map(option => (
                  <option key={option.value} value={option.value} className="bg-gray-800">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Documents List */}
      <div className="space-y-4">
        {isLoadingDocuments ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
              <span className="text-white/70">Loading documents...</span>
            </div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <FileText className="h-16 w-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {documents.length === 0 ? 'No Documents Found' : 'No Matching Documents'}
            </h3>
            <p className="text-white/70">
              {documents.length === 0
                ? 'Process some documents to see them here'
                : 'Try adjusting your search or filter criteria'
              }
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredDocuments.map((document, index) => (
              <motion.div
                key={document.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="flex-shrink-0">
                        {getStatusIcon(document.processing_status)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-white truncate">
                            {document.title || document.filename}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(document.processing_status)}`}>
                            {document.processing_status.toUpperCase()}
                          </span>
                        </div>

                        {document.filename !== document.title && (
                          <p className="text-white/60 text-sm mb-2">
                            File: {document.filename}
                          </p>
                        )}

                        {document.summary && (
                          <p className="text-white/70 text-sm mb-3 line-clamp-2">
                            {document.summary}
                          </p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-white/60">Size:</span>
                            <p className="text-white font-medium">
                              {formatFileSize(document.file_size)}
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Type:</span>
                            <p className="text-white font-medium">
                              {document.file_type.toUpperCase()}
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Processed:</span>
                            <p className="text-white font-medium">
                              {document.processed_at 
                                ? formatDate(document.processed_at)
                                : 'Not processed'
                              }
                            </p>
                          </div>
                          <div>
                            <span className="text-white/60">Job:</span>
                            <p className="text-white font-medium">
                              {jobs.find(j => j.id === document.ingestion_job_id)?.name || 'Unknown'}
                            </p>
                          </div>
                        </div>

                        {document.main_topics && document.main_topics.length > 0 && (
                          <div className="mt-3">
                            <span className="text-white/60 text-sm">Topics: </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {document.main_topics.slice(0, 5).map((topic, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-primary-500/20 text-primary-400 text-xs rounded-full"
                                >
                                  {topic}
                                </span>
                              ))}
                              {document.main_topics.length > 5 && (
                                <span className="text-white/60 text-xs">
                                  +{document.main_topics.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {document.product_tags && document.product_tags.length > 0 && (
                          <div className="mt-2">
                            <span className="text-white/60 text-sm">Tags: </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {document.product_tags.slice(0, 3).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                              {document.product_tags.length > 3 && (
                                <span className="text-white/60 text-xs">
                                  +{document.product_tags.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => handleViewDocument(document)}
                        icon={<Eye className="h-4 w-4" />}
                      >
                        View
                      </Button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {document.error_message && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-red-400 text-sm">{document.error_message}</p>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Document Details Modal */}
      <AnimatePresence>
        {selectedDocument && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setSelectedDocument(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[80vh] overflow-auto"
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Document Details</h3>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => setSelectedDocument(null)}
                  >
                    Close
                  </Button>
                </div>

                <div className="space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Basic Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Title:</span>
                        <p className="text-white font-medium">{selectedDocument.title || 'No title'}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Filename:</span>
                        <p className="text-white font-medium">{selectedDocument.filename}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Author:</span>
                        <p className="text-white font-medium">{selectedDocument.author || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Status:</span>
                        <p className="text-white font-medium">{selectedDocument.processing_status}</p>
                      </div>
                      <div>
                        <span className="text-white/60">File Type:</span>
                        <p className="text-white font-medium">{selectedDocument.file_type.toUpperCase()}</p>
                      </div>
                      <div>
                        <span className="text-white/60">File Size:</span>
                        <p className="text-white font-medium">{formatFileSize(selectedDocument.file_size)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  {selectedDocument.summary && (
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-3">Summary</h4>
                      <div className="p-4 bg-white/5 rounded-lg">
                        <p className="text-white/80">{selectedDocument.summary}</p>
                      </div>
                    </div>
                  )}

                  {/* Topics and Tags */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedDocument.main_topics && selectedDocument.main_topics.length > 0 && (
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3">Main Topics</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedDocument.main_topics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-primary-500/20 text-primary-400 text-sm rounded-full"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedDocument.product_tags && selectedDocument.product_tags.length > 0 && (
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3">Product Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedDocument.product_tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Processing Info */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Processing Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Created:</span>
                        <p className="text-white font-medium">{formatDate(selectedDocument.created_at)}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Processed:</span>
                        <p className="text-white font-medium">
                          {selectedDocument.processed_at 
                            ? formatDate(selectedDocument.processed_at)
                            : 'Not processed'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-white/60">Main Tag:</span>
                        <p className="text-white font-medium">{selectedDocument.main_tag}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Job:</span>
                        <p className="text-white font-medium">
                          {jobs.find(j => j.id === selectedDocument.ingestion_job_id)?.name || 'Unknown'}
                        </p>
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