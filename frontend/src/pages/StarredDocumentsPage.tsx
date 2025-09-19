// src/pages/StarredDocumentsPage.tsx - UPDATED WITH STANDALONE SIDEBAR
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  FileText,
  Search,
  Download,
  Calendar,
  Tag,
  Loader2,
  X,
  Eye
} from 'lucide-react';
import { PageLayout } from '@/components/Layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { starsApi, StarredDocument } from '@/services/starsApi';
import { searchApi } from '@/services/searchApi';
import toast from 'react-hot-toast';

export const StarredDocumentsPage: React.FC = () => {
  const [starredDocuments, setStarredDocuments] = useState<StarredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<StarredDocument | null>(null);

  useEffect(() => {
    loadStarredDocuments();
  }, []);

  const loadStarredDocuments = async () => {
    setIsLoading(true);
    try {
      const documents = await starsApi.getStarredDocuments();
      setStarredDocuments(documents);
    } catch (error) {
      console.error('Error loading starred documents:', error);
      toast.error('Failed to load starred documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstar = async (documentId: string) => {
    try {
      await starsApi.unstarDocument(documentId);
      setStarredDocuments(starredDocuments.filter(doc => doc.document_id !== documentId));
      toast.success('Document removed from favorites');
    } catch (error) {
      console.error('Error unstarring document:', error);
      toast.error('Failed to remove from favorites');
    }
  };

  const handleDownload = async (documentId: string, filename: string) => {
    try {
      const blob = await searchApi.downloadDocument(documentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Failed to download document');
    }
  };

  const filteredDocuments = starredDocuments.filter(doc =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.search_query?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileType = (fileType: string) => {
    return fileType.replace('.', '').toUpperCase();
  };

  return (
    <PageLayout>
      <div className="flex-1 flex flex-col relative z-10 px-6 pt-20">
        <div className="space-y-6 max-w-7xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <Star className="h-6 w-6 text-yellow-400 fill-yellow-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Starred Documents</h2>
                <p className="text-white/60 text-sm mt-1">Your favorite documents in one place</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="glass"
                size="sm"
                onClick={loadStarredDocuments}
                loading={isLoading}
                icon={<Star className="h-4 w-4" />}
              >
                Refresh
              </Button>
              <span className="text-white/70 text-sm">
                {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <GlassCard className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <input
                type="text"
                placeholder="Search starred documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white 
                         placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </GlassCard>

          {/* Documents Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
                <span className="text-white/70">Loading starred documents...</span>
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Star className="h-16 w-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {starredDocuments.length === 0 ? 'No Starred Documents' : 'No Matching Documents'}
              </h3>
              <p className="text-white/70">
                {starredDocuments.length === 0
                  ? 'Star documents from search results to see them here'
                  : 'Try adjusting your search criteria'
                }
              </p>
            </motion.div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-20">
              <AnimatePresence>
                {filteredDocuments.map((document, index) => (
                  <motion.div
                    key={document.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <GlassCard className="p-6 hover:bg-white/5 transition-all duration-200 h-full flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-semibold truncate">
                              {document.title || document.filename}
                            </h3>
                            <p className="text-white/60 text-xs truncate">
                              {document.filename}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnstar(document.document_id)}
                          className="p-1 rounded hover:bg-white/10 text-yellow-400 hover:text-yellow-300"
                          title="Remove from favorites"
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </button>
                      </div>

                      {document.search_query && (
                        <div className="mb-3 p-2 bg-primary-500/10 rounded">
                          <p className="text-xs text-primary-400">
                            Found via: "{document.search_query}"
                          </p>
                        </div>
                      )}

                      {document.summary && (
                        <p className="text-white/70 text-sm mb-4 line-clamp-3 flex-1">
                          {document.summary}
                        </p>
                      )}

                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60 flex items-center space-x-1">
                            <Tag className="h-3 w-3" />
                            <span>Type:</span>
                          </span>
                          <span className="text-white font-medium">
                            {formatFileType(document.file_type)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/60 flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>Starred:</span>
                          </span>
                          <span className="text-white font-medium">
                            {formatDate(document.starred_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-4 border-t border-white/10">
                        <Button
                          variant="glass"
                          size="sm"
                          className="flex-1"
                          onClick={() => setSelectedDocument(document)}
                          icon={<Eye className="h-4 w-4" />}
                        >
                          View
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownload(document.document_id, document.filename)}
                          icon={<Download className="h-4 w-4" />}
                        >
                          Download
                        </Button>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
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
              className="w-full max-w-2xl"
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Document Details</h3>
                  <button
                    onClick={() => setSelectedDocument(null)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">
                      {selectedDocument.title || selectedDocument.filename}
                    </h4>
                    {selectedDocument.title && selectedDocument.title !== selectedDocument.filename && (
                      <p className="text-white/60 text-sm">File: {selectedDocument.filename}</p>
                    )}
                  </div>

                  {selectedDocument.search_query && (
                    <div className="p-3 bg-primary-500/10 rounded-lg border border-primary-500/20">
                      <p className="text-sm text-primary-400">
                        Found via search: "{selectedDocument.search_query}"
                      </p>
                    </div>
                  )}

                  {selectedDocument.summary && (
                    <div>
                      <h5 className="text-white font-medium mb-2">Summary</h5>
                      <p className="text-white/80 text-sm">{selectedDocument.summary}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">File Type:</span>
                      <p className="text-white font-medium">{formatFileType(selectedDocument.file_type)}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Starred On:</span>
                      <p className="text-white font-medium">{formatDate(selectedDocument.starred_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pt-4 border-t border-white/10">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => handleDownload(selectedDocument.document_id, selectedDocument.filename)}
                      icon={<Download className="h-4 w-4" />}
                    >
                      Download Document
                    </Button>
                    <Button
                      variant="glass"
                      className="flex-1"
                      onClick={() => {
                        handleUnstar(selectedDocument.document_id);
                        setSelectedDocument(null);
                      }}
                      icon={<Star className="h-4 w-4" />}
                    >
                      Remove Star
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};