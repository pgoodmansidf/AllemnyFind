// src/pages/SmartMatchPage.tsx - UPDATED WITH STANDALONE SIDEBAR

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  Search,
  Download,
  Calendar,
  Tag,
  Loader2,
  X,
  Eye,
  Package,
  Clock,
  Star,
  Building2,
  MapPin,
  Hash,
  Sparkles,
  FileSearch,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Users,
  Zap,
  Shield,
  Brain,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/Layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { starsApi } from '@/services/starsApi';
import { searchApi } from '@/services/searchApi';
import { apiClient } from '@/services/apiClient';
import toast from 'react-hot-toast';

interface DocumentMetadata {
  products: string[];
  sau_numbers: string[];
  main_city: string;
  main_company: string;
  industry: string;
  sector: string;
  summary: string;
}

interface SimilarDocument {
  id: string;
  filename: string;
  title: string;
  summary: string;
  similarity_score: number;
  matching_products: string[];
  matching_sau: string;
  matching_city: string;
  matching_company: string;
  file_type: string;
  file_size: number;
  modification_date: string;
  relative_date: string;
  is_starred: boolean;
  contributions_count: number;
}

interface AnalysisResult {
  uploaded_document: DocumentMetadata;
  similar_documents: SimilarDocument[];
  total_matches: number;
  analysis_time: number;
}

export const SmartMatchPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SimilarDocument | null>(null);
  const [showContributions, setShowContributions] = useState(false);
  const [contributionText, setContributionText] = useState('');
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const uploadedFile = files[0];
      if (validateFile(uploadedFile)) {
        setFile(uploadedFile);
      }
    }
  }, []);

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx?|txt|xlsx?)$/i)) {
      toast.error('Please upload a PDF, Word, Excel, or text document');
      return false;
    }
    
    if (file.size > maxSize) {
      toast.error('File size must be less than 50MB');
      return false;
    }
    
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const uploadedFile = files[0];
      if (validateFile(uploadedFile)) {
        setFile(uploadedFile);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    // Clean up any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsAnalyzing(true);
    setAnalysisStage('Uploading document...');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Step 1: Upload file and start analysis
      const uploadResponse = await apiClient.post('/smartmatch/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const { task_id } = uploadResponse.data;
      setTaskId(task_id);
      
      console.log('Analysis started with task ID:', task_id);
      
      // Step 2: Connect to SSE stream with token in query
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Authentication token not found');
      }
      
      // Create EventSource with token as query parameter
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const sseUrl = `${baseUrl}/api/v1/smartmatch/analyze-stream?task_id=${task_id}&token=${encodeURIComponent(token)}`;
      
      console.log('Connecting to SSE stream...');
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;
      
      let messageCount = 0;
      
      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };
      
      eventSource.onmessage = (event) => {
        messageCount++;
        console.log(`SSE message ${messageCount}:`, event.data);
        
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'stage':
              setAnalysisStage(data.message);
              break;
              
            case 'metadata':
              console.log('Metadata extracted:', data.data);
              setAnalysisStage('Processing metadata...');
              break;
              
            case 'result':
              console.log('Analysis complete:', data.result);
              setAnalysisResult(data.result);
              setIsAnalyzing(false);
              setAnalysisStage('');
              eventSource.close();
              eventSourceRef.current = null;
              toast.success('Analysis complete!');
              break;
              
            case 'error':
              console.error('Analysis error:', data.message);
              toast.error(data.message || 'Analysis failed');
              setIsAnalyzing(false);
              setAnalysisStage('');
              eventSource.close();
              eventSourceRef.current = null;
              break;
              
            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error, event.data);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        eventSourceRef.current = null;
        
        // Try to get result directly after a delay
        if (task_id && isAnalyzing) {
          setAnalysisStage('Finalizing analysis...');
          
          setTimeout(async () => {
            try {
              console.log('Attempting to fetch result directly...');
              const resultResponse = await apiClient.get(`/smartmatch/analysis/${task_id}`);
              
              if (resultResponse.data.status === 'completed' && resultResponse.data.result) {
                setAnalysisResult(resultResponse.data.result);
                toast.success('Analysis complete!');
              } else if (resultResponse.data.status === 'processing') {
                toast.info('Analysis still in progress. Please wait...');
                // Try again after another delay
                setTimeout(async () => {
                  try {
                    const finalResponse = await apiClient.get(`/smartmatch/analysis/${task_id}`);
                    if (finalResponse.data.status === 'completed' && finalResponse.data.result) {
                      setAnalysisResult(finalResponse.data.result);
                      toast.success('Analysis complete!');
                    } else {
                      toast.error('Analysis is taking longer than expected. Please try again.');
                    }
                  } catch (err) {
                    console.error('Final fetch error:', err);
                  }
                  setIsAnalyzing(false);
                  setAnalysisStage('');
                }, 5000);
              } else {
                toast.error('Analysis failed. Please try again.');
                setIsAnalyzing(false);
                setAnalysisStage('');
              }
            } catch (err: any) {
              console.error('Failed to get result:', err);
              if (err.response?.status === 404) {
                toast.error('Analysis not found. Please try uploading again.');
              } else {
                toast.error('Failed to retrieve analysis results');
              }
              setIsAnalyzing(false);
              setAnalysisStage('');
            }
          }, 3000);
        }
      };
      
    } catch (error: any) {
      console.error('Analysis error:', error);
      
      if (error.response?.status === 401) {
        toast.error('Session expired. Please login again.');
        navigate('/login');
      } else if (error.response?.status === 404) {
        toast.error('SmartMatch service not available. Please contact support.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to analyze document');
      }
      
      setIsAnalyzing(false);
      setAnalysisStage('');
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleDownload = async (doc: SimilarDocument) => {
    try {
      const blob = await searchApi.downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${doc.filename}`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    }
  };

  const handleStar = async (doc: SimilarDocument) => {
    try {
      if (doc.is_starred) {
        await starsApi.unstarDocument(doc.id);
        doc.is_starred = false;
        toast.success('Removed from favorites');
      } else {
        await starsApi.starDocument(doc.id);
        doc.is_starred = true;
        toast.success('Added to favorites');
      }
      // Update state
      setAnalysisResult(prev => prev ? {
        ...prev,
        similar_documents: prev.similar_documents.map(d => 
          d.id === doc.id ? { ...d, is_starred: doc.is_starred } : d
        )
      } : null);
    } catch (error) {
      console.error('Star error:', error);
      toast.error('Failed to update favorite status');
    }
  };

  const handleContribute = async (doc: SimilarDocument) => {
    setSelectedDocument(doc);
    setShowContributions(true);
  };

  const handleSubmitContribution = async () => {
    if (!contributionText.trim() || !selectedDocument) return;
    
    try {
      await starsApi.createContribution(selectedDocument.id, contributionText);
      toast.success('Contribution added successfully');
      setContributionText('');
      setShowContributions(false);
      // Update contribution count
      setAnalysisResult(prev => prev ? {
        ...prev,
        similar_documents: prev.similar_documents.map(d => 
          d.id === selectedDocument.id 
            ? { ...d, contributions_count: d.contributions_count + 1 } 
            : d
        )
      } : null);
    } catch (error) {
      console.error('Contribution error:', error);
      toast.error('Failed to submit contribution');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getSimilarityColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    if (score >= 0.4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getSimilarityLabel = (score: number): string => {
    if (score >= 0.8) return 'Excellent Match';
    if (score >= 0.6) return 'Good Match';
    if (score >= 0.4) return 'Fair Match';
    return 'Weak Match';
  };

  return (
    <PageLayout>
      <div className="flex-1 flex flex-col relative z-10 px-6 pt-20">
        <div className="max-w-7xl mx-auto w-full">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white">SmartMatch</h1>
                <p className="text-white/70 text-lg mt-1">
                  Find Similar Information
                </p>
              </div>
            </div>
          </motion.div>

          {!analysisResult ? (
            <>
              {/* Upload Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <GlassCard className="p-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-white mb-2">
                      Upload Your Document
                    </h2>
                    <p className="text-white/60">
                      Upload a document to find similar content in the Knowledge Hub
                    </p>
                  </div>

                  {/* Drop Zone */}
                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? 'border-primary-400 bg-primary-500/10' 
                        : 'border-white/30 hover:border-white/50 hover:bg-white/5'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    
                    {file ? (
                      <div className="space-y-4">
                        <FileText className="h-16 w-16 text-primary-400 mx-auto" />
                        <div>
                          <p className="text-xl font-medium text-white">{file.name}</p>
                          <p className="text-white/60 text-sm mt-1">
                            {formatFileSize(file.size)} • Ready to analyze
                          </p>
                        </div>
                        <div className="flex items-center justify-center space-x-3">
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                            }}
                          >
                            Change File
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Brain className="h-4 w-4" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze();
                            }}
                            disabled={isAnalyzing}
                            loading={isAnalyzing}
                          >
                            Analyze Document
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="h-16 w-16 text-white/40 mx-auto" />
                        <div>
                          <p className="text-xl font-medium text-white">
                            {isDragging ? 'Drop your file here' : 'Drag & drop your document'}
                          </p>
                          <p className="text-white/60 text-sm mt-1">
                            or click to browse • PDF, Word, Excel, or Text files
                          </p>
                          <p className="text-white/40 text-xs mt-2">
                            Maximum file size: 50MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Analysis Stage */}
                  {isAnalyzing && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
                        <span className="text-white font-medium">{analysisStage}</span>
                      </div>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>

              
            </>
          ) : (
            /* Results Section */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Uploaded Document Summary */}
              <GlassCard className="p-6 border-primary-500/30 bg-gradient-to-br from-primary-500/10 to-transparent">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-6 w-6 text-primary-400" />
                    <h2 className="text-xl font-semibold text-white">Your uploaded document</h2>
                  </div>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => {
                      setAnalysisResult(null);
                      setFile(null);
                    }}
                  >
                    New Analysis
                  </Button>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-white/60 text-sm mb-1">Industry & Sector</p>
                      <p className="text-white font-medium">
                        {analysisResult.uploaded_document.industry} • {analysisResult.uploaded_document.sector}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-white/60 text-sm mb-2">Detected Products</p>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.uploaded_document.products.length > 0 ? (
                          analysisResult.uploaded_document.products.map((product, idx) => (
                            <span key={idx} className="px-3 py-1 bg-primary-500/20 border border-primary-500/30 rounded-full text-sm text-primary-300">
                              {product}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/40 text-sm">No products detected</span>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-white/60 text-sm mb-2">SAU Numbers</p>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.uploaded_document.sau_numbers.length > 0 ? (
                          analysisResult.uploaded_document.sau_numbers.map((sau, idx) => (
                            <span key={idx} className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-sm text-blue-300">
                              {sau}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/40 text-sm">No SAU numbers detected</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-white/60 text-sm mb-1">Main Company</p>
                      <p className="text-white font-medium">
                        {analysisResult.uploaded_document.main_company || 'Not detected'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-white/60 text-sm mb-1">Location</p>
                      <p className="text-white font-medium">
                        {analysisResult.uploaded_document.main_city || 'Not detected'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-white/60 text-sm mb-2">Summary</p>
                      <p className="text-white/80 text-sm leading-relaxed">
                        {analysisResult.uploaded_document.summary}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-white/60 text-sm">
                    Analysis completed in {analysisResult.analysis_time.toFixed(2)} seconds
                  </span>
                  <span className="text-white font-medium">
                    {analysisResult.total_matches} similar documents found
                  </span>
                </div>
              </GlassCard>

              {/* Similar Documents */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">
                  Documents you may be interested in
                </h3>
                
                {analysisResult.similar_documents.length > 0 ? (
                  <div className="space-y-4">
                    {analysisResult.similar_documents.map((doc) => (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                      >
                        <GlassCard className="p-6 hover:bg-white/5 transition-colors">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <FileText className="h-5 w-5 text-white/60" />
                                <h4 className="text-lg font-medium text-white">
                                  {doc.title || doc.filename}
                                </h4>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSimilarityColor(doc.similarity_score)}`}>
                                  {(doc.similarity_score * 100).toFixed(0)}% Match • {getSimilarityLabel(doc.similarity_score)}
                                </span>
                              </div>
                              
                              <p className="text-white/70 text-sm mb-3">
                                {doc.summary}
                              </p>
                              
                              {/* Matching Criteria */}
                              <div className="flex flex-wrap gap-3 mb-3">
                                {doc.matching_products.length > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <Package className="h-4 w-4 text-primary-400" />
                                    <span className="text-sm text-white/60">
                                      {doc.matching_products.length} matching products
                                    </span>
                                  </div>
                                )}
                                
                                {doc.matching_sau && (
                                  <div className="flex items-center space-x-2">
                                    <Hash className="h-4 w-4 text-blue-400" />
                                    <span className="text-sm text-white/60">
                                      SAU: {doc.matching_sau}
                                    </span>
                                  </div>
                                )}
                                
                                {doc.matching_city && (
                                  <div className="flex items-center space-x-2">
                                    <MapPin className="h-4 w-4 text-green-400" />
                                    <span className="text-sm text-white/60">
                                      {doc.matching_city}
                                    </span>
                                  </div>
                                )}
                                
                                {doc.matching_company && (
                                  <div className="flex items-center space-x-2">
                                    <Building2 className="h-4 w-4 text-purple-400" />
                                    <span className="text-sm text-white/60">
                                      {doc.matching_company}
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Document Info */}
                              <div className="flex items-center space-x-4 text-xs text-white/50">
                                <span>{doc.file_type.toUpperCase()}</span>
                                <span>{formatFileSize(doc.file_size)}</span>
                                <span>{doc.relative_date}</span>
                                {doc.contributions_count > 0 && (
                                  <span className="text-yellow-400">
                                    {doc.contributions_count} contributions
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center space-x-2 ml-4">
                              <Button
                                variant="glass"
                                size="sm"
                                icon={doc.is_starred ? 
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" /> : 
                                  <Star className="h-4 w-4" />
                                }
                                onClick={() => handleStar(doc)}
                                title={doc.is_starred ? "Remove from favorites" : "Add to favorites"}
                              />
                              <Button
                                variant="glass"
                                size="sm"
                                icon={<Users className="h-4 w-4" />}
                                onClick={() => handleContribute(doc)}
                                title="View contributions"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<Download className="h-4 w-4" />}
                                onClick={() => handleDownload(doc)}
                              >
                                Download
                              </Button>
                            </div>
                          </div>
                          
                          {/* Expand to show matching products */}
                          {doc.matching_products.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedDocuments);
                                  if (newExpanded.has(doc.id)) {
                                    newExpanded.delete(doc.id);
                                  } else {
                                    newExpanded.add(doc.id);
                                  }
                                  setExpandedDocuments(newExpanded);
                                }}
                                className="text-sm text-primary-400 hover:text-primary-300 flex items-center space-x-1"
                              >
                                <span>Show matching products</span>
                                <motion.div
                                  animate={{ rotate: expandedDocuments.has(doc.id) ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </motion.div>
                              </button>
                              
                              <AnimatePresence>
                                {expandedDocuments.has(doc.id) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mt-3 flex flex-wrap gap-2"
                                  >
                                    {doc.matching_products.map((product, idx) => (
                                      <span 
                                        key={idx}
                                        className="px-3 py-1 bg-primary-500/20 border border-primary-500/30 rounded-full text-sm text-primary-300"
                                      >
                                        {product}
                                      </span>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <GlassCard className="p-12 text-center">
                    <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      No Similar Documents Found
                    </h3>
                    <p className="text-white/60 max-w-md mx-auto">
                      We couldn't find any documents matching your uploaded file. 
                      This might be unique content and not yet in the Knowledge Hub.
                      Contact allemny@sidf.gov.sa.
                    </p>
                  </GlassCard>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Contribution Modal */}
      <AnimatePresence>
        {showContributions && selectedDocument && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-white/20"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Add Contribution
                </h3>
                <button
                  onClick={() => setShowContributions(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <p className="text-white/60 text-sm mb-4">
                Document: {selectedDocument.filename}
              </p>
              
              <textarea
                value={contributionText}
                onChange={(e) => setContributionText(e.target.value)}
                placeholder="Share your insights about this document..."
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 
                         focus:outline-none focus:border-primary-400 resize-none"
                rows={4}
              />
              
              <div className="flex justify-end space-x-3 mt-4">
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => setShowContributions(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitContribution}
                  disabled={!contributionText.trim()}
                >
                  Submit
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};