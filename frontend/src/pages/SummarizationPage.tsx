// src/pages/SummarizationPage.tsx - UPDATED WITH STANDALONE SIDEBAR
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Clock,
  Star,
  Trash2,
  Download,
  Copy,
  Check,
  Loader2,
  Brain,
  BookOpen,
  TrendingUp,
  BarChart3,
  FileSearch,
  Plus,
  X,
  Search,
  Filter,
  ChevronRight,
  Calendar,
  Tag,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { PageLayout } from '@/components/Layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSummarizationStore } from '@/store/summarizationStore';
import { DocumentSelector } from '@/components/summarization/DocumentSelector';
import { SummaryDisplay } from '@/components/summarization/SummaryDisplay';
import { SummaryHistory } from '@/components/summarization/SummaryHistory';
import toast from 'react-hot-toast';

export const SummarizationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  
  const {
    selectedDocuments,
    summaryType,
    topic,
    isGenerating,
    currentStage,
    streamingContent,
    currentSummary,
    summaryHistory,
    setSummaryType,
    setTopic,
    generateSummary,
    loadSummaryHistory,
    loadAvailableDocuments,
    clearDocumentSelection
  } = useSummarizationStore();

  useEffect(() => {
    loadAvailableDocuments();
    loadSummaryHistory();
  }, []);

  const handleGenerateSummary = async () => {
    if (selectedDocuments.length === 0) {
      toast.error('Please select at least one document');
      return;
    }
    await generateSummary();
  };

  const summaryTypeOptions = [
    {
      value: 'general' as const,
      label: 'General Summary',
      description: 'Comprehensive summary with technical details',
      icon: <FileText className="h-5 w-5" />
    },
    {
      value: 'executive' as const,
      label: 'Executive Summary',
      description: 'High-level overview with key findings and recommendations',
      icon: <Brain className="h-5 w-5" />
    },
    {
      value: 'research_brief' as const,
      label: 'Research Brief',
      description: 'Detailed research analysis with methodology and implications',
      icon: <BookOpen className="h-5 w-5" />
    }
  ];

  return (
    <PageLayout>
      <div className="flex-1 relative z-10 px-6 pt-20">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-white">Document Summarization</h1>
                  <p className="text-white/70 text-lg mt-1">
                    Create AI-powered summaries with citations and insights
                  </p>
                </div>
              </div>
              {/* Tab Navigation */}
              <div className="flex space-x-1 bg-white/5 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('create')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    activeTab === 'create'
                      ? 'bg-primary-500 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span>Create Summary</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    activeTab === 'history'
                      ? 'bg-primary-500 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span>History</span>
                    {summaryHistory.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                        {summaryHistory.length}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'create' ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Document Selection */}
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
                      <FileSearch className="h-5 w-5 text-primary-400" />
                      <span>Document Selection</span>
                    </h2>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowDocumentSelector(true)}
                      icon={<Plus className="h-4 w-4" />}
                    >
                      Select Documents
                    </Button>
                  </div>

                  {selectedDocuments.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-white/60 text-sm">
                        {selectedDocuments.length} document{selectedDocuments.length > 1 ? 's' : ''} selected
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedDocuments.slice(0, 5).map((docId) => (
                          <span
                            key={docId}
                            className="px-3 py-1 bg-primary-500/20 border border-primary-500/30 rounded-full text-sm text-primary-300"
                          >
                            {docId.slice(0, 8)}...
                          </span>
                        ))}
                        {selectedDocuments.length > 5 && (
                          <span className="px-3 py-1 bg-white/10 rounded-full text-sm text-white/60">
                            +{selectedDocuments.length - 5} more
                          </span>
                        )}
                      </div>
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={clearDocumentSelection}
                        className="mt-2"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  ) : (
                    <p className="text-white/40 text-center py-8">
                      No documents selected. Click "Select Documents" to begin.
                    </p>
                  )}
                </GlassCard>

                {/* Summary Options */}
                <GlassCard className="p-6">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-primary-400" />
                    <span>Summary Options</span>
                  </h2>

                  <div className="space-y-4">
                    {/* Summary Type Selection */}
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        Summary Type
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {summaryTypeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSummaryType(option.value)}
                            className={`p-4 rounded-lg border transition-all ${
                              summaryType === option.value
                                ? 'bg-primary-500/20 border-primary-500 text-white'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center space-x-3 mb-2">
                              {option.icon}
                              <span className="font-medium">{option.label}</span>
                            </div>
                            <p className="text-xs text-left">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Topic Input (for research brief) */}
                    {summaryType === 'research_brief' && (
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Research Topic (Optional)
                        </label>
                        <input
                          type="text"
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="Enter specific topic or leave blank for general analysis"
                          className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white
                            placeholder-white/40 focus:outline-none focus:border-primary-400"
                        />
                      </div>
                    )}

                    {/* Generate Button */}
                    <div className="flex justify-end pt-4">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handleGenerateSummary}
                        disabled={isGenerating || selectedDocuments.length === 0}
                        loading={isGenerating}
                        icon={<Brain className="h-5 w-5" />}
                      >
                        {isGenerating ? currentStage : 'Generate Summary'}
                      </Button>
                    </div>
                  </div>
                </GlassCard>

                {/* Summary Display */}
                {(streamingContent || currentSummary) && (
                  <SummaryDisplay
                    content={streamingContent}
                    summary={currentSummary}
                    isStreaming={isGenerating}
                    currentStage={currentStage}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <SummaryHistory />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Document Selector Modal */}
          <AnimatePresence>
            {showDocumentSelector && (
              <DocumentSelector
                onClose={() => setShowDocumentSelector(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageLayout>
  );
};