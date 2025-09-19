import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Search,
  FileText,
  Check,
  Calendar,
  Tag,
  Database,
  Filter
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSummarizationStore } from '@/store/summarizationStore';
import { AvailableDocument } from '@/services/summarizationApi';

interface DocumentSelectorProps {
  onClose: () => void;
}

export const DocumentSelector: React.FC<DocumentSelectorProps> = ({ onClose }) => {
  const {
    availableDocuments,
    selectedDocuments,
    toggleDocumentSelection,
    loadAvailableDocuments
  } = useSummarizationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');

  useEffect(() => {
    if (availableDocuments.length === 0) {
      loadAvailableDocuments();
    }
  }, []);

  // Filter and sort documents
  const filteredDocuments = availableDocuments
    .filter(doc => {
      const matchesSearch = searchQuery === '' || 
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTag = filterTag === '' || 
        doc.main_tag === filterTag ||
        doc.product_tags.includes(filterTag);
      
      return matchesSearch && matchesTag;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.filename.localeCompare(b.filename);
        case 'size':
          return b.file_size - a.file_size;
        case 'date':
        default:
          return new Date(b.modification_date || b.creation_date || 0).getTime() - 
                 new Date(a.modification_date || a.creation_date || 0).getTime();
      }
    });

  // Get unique tags
  const allTags = new Set<string>();
  availableDocuments.forEach(doc => {
    if (doc.main_tag) allTags.add(doc.main_tag);
    doc.product_tags.forEach(tag => allTags.add(tag));
  });

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[80vh] flex flex-col"
      >
        <GlassCard className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white flex items-center space-x-2">
                <Database className="h-6 w-6 text-primary-400" />
                <span>Select Documents for Summarization</span>
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[300px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search documents..."
                    className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg 
                             text-white placeholder-white/40 focus:outline-none focus:border-primary-400"
                  />
                </div>
              </div>

              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white 
                         focus:outline-none focus:border-primary-400"
              >
                <option value="">All Tags</option>
                {Array.from(allTags).map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
                className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white 
                         focus:outline-none focus:border-primary-400"
              >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
                <option value="size">Sort by Size</option>
              </select>
            </div>

            {/* Selection Count */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-white/60 text-sm">
                {selectedDocuments.length} of {filteredDocuments.length} documents selected
              </p>
              {selectedDocuments.length > 0 && (
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => selectedDocuments.forEach(id => toggleDocumentSelection(id))}
                >
                  Clear Selection
                </Button>
              )}
            </div>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/60">No documents found</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredDocuments.map((doc) => (
                  <motion.div
                    key={doc.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedDocuments.includes(doc.id)
                        ? 'bg-primary-500/20 border-primary-500'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <FileText className={`h-5 w-5 ${
                            selectedDocuments.includes(doc.id) 
                              ? 'text-primary-400' 
                              : 'text-white/60'
                          }`} />
                          <div className="flex-1">
                            <h3 className="text-white font-medium">{doc.title}</h3>
                            <p className="text-white/60 text-sm">{doc.filename}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 mt-2 text-xs text-white/50">
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(doc.modification_date)}</span>
                          </span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>{doc.chunk_count} chunks</span>
                          {doc.main_tag && (
                            <span className="flex items-center space-x-1">
                              <Tag className="h-3 w-3" />
                              <span>{doc.main_tag}</span>
                            </span>
                          )}
                        </div>

                        {doc.product_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.product_tags.slice(0, 5).map(tag => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60"
                              >
                                {tag}
                              </span>
                            ))}
                            {doc.product_tags.length > 5 && (
                              <span className="px-2 py-0.5 text-xs text-white/40">
                                +{doc.product_tags.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-4">
                        {selectedDocuments.includes(doc.id) && (
                          <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/10">
            <div className="flex justify-end space-x-3">
              <Button variant="glass" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onClose}
                disabled={selectedDocuments.length === 0}
              >
                Confirm Selection ({selectedDocuments.length})
              </Button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
};