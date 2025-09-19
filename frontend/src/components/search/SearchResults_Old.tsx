// SearchResults.tsx - COMPLETE UPDATED VERSION WITH ENHANCED CONTRIBUTIONS

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Link,
  Clock,
  Globe,
  Database,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  MessageSquare,
  Plus,
  Bug,
  Eye,
  EyeOff,
  Download,
  Tag,
  Calendar,
  Table,
  Package,
  Brain,
  BookOpen,
  Sparkles,
  FileSearch,
  AlertCircle,
  Mail,
  Forward,
  Star,
  Users,
  Heart,
  Edit2,
  Trash2,
  X
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/store/searchStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import remarkBreaks from 'remark-breaks';
import toast from 'react-hot-toast';
import { searchApi } from '@/services/searchApi';
import { starsApi, Contribution } from '@/services/starsApi';

interface ProductResult {
  product: string;
  domain: string;
  cited_definition: string;
  ai_definition: string;
  source_document: {
    document_id: string;
    filename: string;
    modification_date: string | Date | null;
    relative_date: string;
    main_tag: string;
    file_size: number;
  };
  all_document_ids?: string[];
  chunks_used: number;
}

interface ProductListItem {
  product: string;
  document_count: number;
  chunk_count: number;
  best_match_score: number;
  sample_document: {
    filename: string;
    modification_date?: string | Date | null;
    relative_date: string;
    document_id?: string;
  };
}

interface SearchResultsProps {
  streamingContent?: string;
  isStreaming?: boolean;
  stageMessage?: string;
  documentGroups?: Record<string, any>;
  responseType?: 'single_result' | 'multiple_results' | 'content_chunk' | 'no_results' | null;
  productData?: ProductResult;
  productList?: ProductListItem[];
  onProductSelection?: (product: string) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  streamingContent,
  isStreaming = false,
  stageMessage = '',
  documentGroups = {},
  responseType,
  productData,
  productList,
  onProductSelection
}) => {
  const { searchResults, currentQuery, addComment } = useSearchStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [displayContent, setDisplayContent] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [comment, setComment] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showRawContent, setShowRawContent] = useState(false);
  const [localDocumentGroups, setLocalDocumentGroups] = useState<Record<string, any>>(documentGroups);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [singleProductResult, setSingleProductResult] = useState<ProductResult | null>(productData || null);
  const [multipleProducts, setMultipleProducts] = useState<ProductListItem[]>(productList || []);
  const [noResultsFound, setNoResultsFound] = useState(false);
  
  // Star functionality states
  const [isStarred, setIsStarred] = useState(false);
  const [isLoadingStar, setIsLoadingStar] = useState(false);
  
  // Contributions states
  const [showContributions, setShowContributions] = useState(false);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributionsCount, setContributionsCount] = useState(0);
  const [isLoadingContributions, setIsLoadingContributions] = useState(false);
  const [contributionText, setContributionText] = useState('');
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const [editingContribution, setEditingContribution] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [animatingHearts, setAnimatingHearts] = useState<Set<string>>(new Set());

  // Check star status and contributions count when single product result is loaded
  useEffect(() => {
    const checkDocumentStatus = async () => {
      if (singleProductResult?.source_document?.document_id) {
        try {
          // Check star status
          const starStatus = await starsApi.getDocumentStarStatus(singleProductResult.source_document.document_id);
          setIsStarred(starStatus.is_starred);
          
          // Get contributions count
          const contribs = await starsApi.getDocumentContributions(singleProductResult.source_document.document_id);
          setContributionsCount(contribs.length);
        } catch (error) {
          console.error('Error checking document status:', error);
        }
      }
    };
    checkDocumentStatus();
  }, [singleProductResult]);

  // Load contributions when panel is opened
  useEffect(() => {
    const loadContributions = async () => {
      if (showContributions && singleProductResult?.source_document?.document_id) {
        setIsLoadingContributions(true);
        try {
          const data = await starsApi.getDocumentContributions(singleProductResult.source_document.document_id);
          setContributions(data);
          setContributionsCount(data.length);
        } catch (error) {
          console.error('Error loading contributions:', error);
          toast.error('Failed to load contributions');
        } finally {
          setIsLoadingContributions(false);
        }
      }
    };
    loadContributions();
  }, [showContributions, singleProductResult]);

  // Update display content when streaming
  useEffect(() => {
    if (responseType === 'no_results') {
      setNoResultsFound(true);
      setSingleProductResult(null);
      setMultipleProducts([]);
    } else if (responseType === 'single_result' && productData) {
      setSingleProductResult(productData);
      setMultipleProducts([]);
      setNoResultsFound(false);
    } else if (responseType === 'multiple_results' && productList) {
      setMultipleProducts(productList);
      setSingleProductResult(null);
      setNoResultsFound(false);
    } else if (streamingContent) {
      setDisplayContent(streamingContent);
    } else if (searchResults?.response) {
      setDisplayContent(searchResults.response);
    }
  }, [streamingContent, searchResults, responseType, productData, productList]);

  // Update document groups
  useEffect(() => {
    if (documentGroups && Object.keys(documentGroups).length > 0) {
      setLocalDocumentGroups(documentGroups);
    } else if (searchResults?.document_groups) {
      setLocalDocumentGroups(searchResults.document_groups);
    }
  }, [documentGroups, searchResults]);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayContent, isStreaming]);

  const handleStarToggle = async () => {
    if (!singleProductResult?.source_document?.document_id) return;
    
    setIsLoadingStar(true);
    try {
      if (isStarred) {
        await starsApi.unstarDocument(singleProductResult.source_document.document_id);
        setIsStarred(false);
        toast.success('Document removed from favorites');
      } else {
        await starsApi.starDocument(singleProductResult.source_document.document_id, currentQuery);
        setIsStarred(true);
        toast.success('Document added to favorites');
      }
    } catch (error) {
      console.error('Error toggling star:', error);
      toast.error('Failed to update favorite status');
    } finally {
      setIsLoadingStar(false);
    }
  };

  const handleContributeClick = () => {
    setShowContributions(true);
  };

  const handleCloseContributions = () => {
    setShowContributions(false);
    setContributionText('');
  };

  const handleSubmitContribution = async () => {
    if (!contributionText.trim() || !singleProductResult?.source_document?.document_id) return;
    
    setIsSubmittingContribution(true);
    try {
      const newContribution = await starsApi.createContribution(
        singleProductResult.source_document.document_id,
        contributionText
      );
      setContributions([newContribution, ...contributions]);
      setContributionsCount(prev => prev + 1);
      setContributionText('');
      toast.success('Contribution added successfully');
    } catch (error) {
      console.error('Error submitting contribution:', error);
      toast.error('Failed to submit contribution');
    } finally {
      setIsSubmittingContribution(false);
    }
  };

  const handleEditContribution = async (contributionId: string) => {
    if (!editText.trim()) return;
    
    try {
      const updated = await starsApi.updateContribution(contributionId, editText);
      setContributions(contributions.map(c => c.id === contributionId ? updated : c));
      setEditingContribution(null);
      setEditText('');
      toast.success('Contribution updated');
    } catch (error) {
      console.error('Error updating contribution:', error);
      toast.error('Failed to update contribution');
    }
  };

  const handleDeleteContribution = async (contributionId: string) => {
    if (!confirm('Are you sure you want to delete this contribution?')) return;
    
    try {
      await starsApi.deleteContribution(contributionId);
      setContributions(contributions.filter(c => c.id !== contributionId));
      setContributionsCount(prev => prev - 1);
      toast.success('Contribution deleted');
    } catch (error) {
      console.error('Error deleting contribution:', error);
      toast.error('Failed to delete contribution');
    }
  };

  const handleLikeToggle = async (contribution: Contribution) => {
    // Trigger heart animation
    setAnimatingHearts(prev => new Set(prev).add(contribution.id));
    setTimeout(() => {
      setAnimatingHearts(prev => {
        const newSet = new Set(prev);
        newSet.delete(contribution.id);
        return newSet;
      });
    }, 600);

    try {
      if (contribution.user_liked) {
        const result = await starsApi.unlikeContribution(contribution.id);
        setContributions(contributions.map(c => 
          c.id === contribution.id 
            ? { ...c, user_liked: false, like_count: result.like_count }
            : c
        ));
      } else {
        const result = await starsApi.likeContribution(contribution.id);
        setContributions(contributions.map(c => 
          c.id === contribution.id 
            ? { ...c, user_liked: true, like_count: result.like_count }
            : c
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like');
    }
  };

  const handleCopySection = async (content: string, sectionId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSection(sectionId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const handleAddComment = async () => {
    if (comment.trim() && searchResults) {
      await addComment(searchResults.id, comment);
      setComment('');
      setShowCommentInput(false);
      toast.success('Comment added successfully');
    }
  };

  const handleDownloadDocument = async (documentId: string, filename: string) => {
    try {
      if (!documentId) {
        toast.error('Document ID not available');
        return;
      }
      
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
      console.error('Download error:', error);
      toast.error('Failed to download document');
    }
  };

  const handleProductButtonClick = (product: string) => {
    console.log('Product button clicked:', product);
    setSelectedProduct(product);
    
    if (onProductSelection) {
      onProductSelection(product);
    } else {
      console.error('onProductSelection callback not provided');
      toast.error('Unable to analyze product - callback not configured');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'Date not available';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Date not available';
      return dateObj.toLocaleDateString();
    } catch {
      return 'Date not available';
    }
  };

  const formatResultsForCopy = (): string => {
    if (singleProductResult) {
      return `
${singleProductResult.product}
Domain Expert: ${singleProductResult.domain}

DEFINITION FROM DOCUMENTS:
${singleProductResult.cited_definition}

AI GENERATED DEFINITION:
${singleProductResult.ai_definition}

SOURCE DOCUMENT:
File: ${singleProductResult.source_document.filename}
Modified: ${formatDate(singleProductResult.source_document.modification_date)} (${singleProductResult.source_document.relative_date})
Document Type: ${singleProductResult.source_document.main_tag}
Chunks Analyzed: ${singleProductResult.chunks_used}
      `.trim();
    }
    return displayContent;
  };

  const handleCopyResults = async () => {
    try {
      const resultsText = formatResultsForCopy();
      await navigator.clipboard.writeText(resultsText);
      toast.success('Results copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy results');
    }
  };

  const handleShare = async () => {
    const shouldDownloadDocs = await new Promise<boolean>((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="bg-gray-900 rounded-lg p-6 max-w-md border border-white/20">
          <h3 class="text-lg font-semibold text-white mb-4">Share Results</h3>
          <p class="text-white/80 mb-6">Would you like to download the source documents so you can add it to your email later?</p>
          <div class="flex space-x-3">
            <button id="share-yes" class="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors">Yes, download documents too</button>
            <button id="share-no" class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors">No, just the results</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      document.getElementById('share-yes')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });
      
      document.getElementById('share-no')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
    });

    if (shouldDownloadDocs && singleProductResult?.all_document_ids) {
      toast.loading('Downloading source documents...', { id: 'download-docs' });
      for (const docId of singleProductResult.all_document_ids) {
        try {
          const blob = await searchApi.downloadDocument(docId);
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `document_${docId}.pdf`);
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        } catch (error) {
          console.error(`Failed to download document ${docId}:`, error);
        }
      }
      toast.success('Documents downloaded', { id: 'download-docs' });
    }

    const subject = encodeURIComponent(singleProductResult?.product || currentQuery || 'Search Results');
    const body = encodeURIComponent(formatResultsForCopy());
    
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const renderSingleProductResult = (result: ProductResult) => {
    return (
      <div className="space-y-6">
        {/* Product Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-lg border border-primary-500/30">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center">
              <Package className="h-7 w-7 text-primary-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{result.product}</h2>
              <p className="text-white/60 text-sm mt-1">Domain Expert: {result.domain}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-primary-500/20 border border-primary-500/30 rounded-full text-xs text-primary-300">
              {result.chunks_used} chunks analyzed
            </span>
          </div>
        </div>

        {/* Cited Definition */}
        <div className="p-6 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center space-x-2 mb-4">
            <BookOpen className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Definition from Documents</h3>
          </div>
          <div className="text-white">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm, remarkEmoji, remarkBreaks]}
              components={{
                p: ({ children }) => <p className="text-white mb-2">{children}</p>,
                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                em: ({ children }) => <em className="text-white/90 italic">{children}</em>,
              }}
            >
              {result.cited_definition}
            </ReactMarkdown>
          </div>
        </div>

        {/* AI Generated Definition */}
        <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
          <div className="flex items-center space-x-2 mb-4">
            <Brain className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">AI Generated Definition</h3>
            <span className="px-2 py-1 bg-purple-500/20 rounded text-xs text-purple-300 flex items-center space-x-1">
              <Sparkles className="h-3 w-3" />
              <span>AI Generated</span>
            </span>
          </div>
          <div className="text-white/90 leading-relaxed">
            {result.ai_definition}
          </div>
        </div>

        {/* Source Document with Star and Enhanced Contribute button */}
        <div className="p-6 bg-black/40 rounded-lg border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <FileText className="h-6 w-6 text-primary-400" />
              <div>
                <h4 className="text-white font-semibold">{result.source_document.filename}</h4>
                <div className="flex items-center space-x-4 mt-2 text-sm text-white/60">
                  <span className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {formatDate(result.source_document.modification_date)} 
                      {result.source_document.relative_date && ` (${result.source_document.relative_date})`}
                    </span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Tag className="h-3 w-3" />
                    <span>{result.source_document.main_tag || 'Uncategorized'}</span>
                  </span>
                  <span>{formatFileSize(result.source_document.file_size)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="glass"
                size="sm"
                icon={isLoadingStar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />}
                onClick={handleStarToggle}
                disabled={isLoadingStar || !result.source_document.document_id}
                title={isStarred ? "Remove from favorites" : "Add to favorites"}
              >
                {isStarred ? 'Starred' : 'Star'}
              </Button>
              <div className="relative">
                <Button
                  variant="glass"
                  size="sm"
                  icon={<Users className="h-4 w-4" />}
                  onClick={handleContributeClick}
                  disabled={!result.source_document.document_id}
                  title="View and add contributions"
                >
                  Contribute
                </Button>
                {contributionsCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {contributionsCount}
                  </span>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={() => handleDownloadDocument(
                  result.source_document.document_id, 
                  result.source_document.filename
                )}
                disabled={!result.source_document.document_id}
              >
                Download
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMultipleProducts = (products: ProductListItem[]) => {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <h2 className="text-2xl font-bold text-white mb-2">Multiple Products Found</h2>
          <p className="text-white/60">Select a product to get detailed information with domain expertise</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {products.map((item, index) => (
            <motion.div
              key={`${item.product}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group"
            >
              <div className="p-6 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 
                            hover:border-primary-500/50 transition-all duration-200 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center 
                                  group-hover:bg-primary-500/30 transition-colors">
                      <Package className="h-5 w-5 text-primary-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary-300 transition-colors">
                        {item.product}
                      </h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-green-400">
                          {(item.best_match_score * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/40 group-hover:text-primary-400 
                                         group-hover:translate-x-1 transition-all" />
                </div>

                <div className="space-y-2 text-sm flex-1">
                  <div className="flex items-center justify-between text-white/60">
                    <span className="flex items-center space-x-1">
                      <FileText className="h-3 w-3" />
                      <span>{item.document_count} document{item.document_count > 1 ? 's' : ''}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <FileSearch className="h-3 w-3" />
                      <span>{item.chunk_count} chunks</span>
                    </span>
                  </div>
                  
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-white/50">Latest document:</p>
                    <p className="text-xs text-white/70 truncate">
                      {item.sample_document.filename} • {item.sample_document.relative_date || 'Date not available'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    icon={<Brain className="h-4 w-4" />}
                    onClick={() => handleProductButtonClick(item.product)}
                  >
                    Get Expert Analysis
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderNoResults = () => {
    return (
      <div className="py-16">
        <div className="text-center">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-yellow-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Results Found</h3>
          <p className="text-white/60 max-w-md mx-auto">
            No documents containing information about <span className="text-primary-400 font-semibold">"{currentQuery}"</span> were found.
          </p>
          <div className="mt-6 space-y-2 text-sm text-white/50">
            <p>Try:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Using different or more general search terms</li>
              <li>Checking if the relevant documents have been ingested</li>
              <li>Searching for related products or topics</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const preprocessContent = (content: string): string => {
    let cleaned = content
      .replace(/┏━.*?━┓/g, '')
      .replace(/┗━.*?━┛/g, '')
      .replace(/┃/g, '')
      .replace(/▰+▱+/g, '')
      .replace(/Thinking\.\.\./g, '')
      .trim();

    cleaned = cleaned.replace(/\*\*Sources & References:\*\*[\s\S]*?(?=\n\n|$)/g, '');

    const lines = cleaned.split('\n');
    const processedLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      
      if (isTableLine(line)) {
        const tableLines = [line];
        i++;
        
        while (i < lines.length && (isTableLine(lines[i]) || lines[i].trim() === '')) {
          if (lines[i].trim() !== '') {
            tableLines.push(lines[i]);
          }
          i++;
        }
        
        if (tableLines.length > 1) {
          processedLines.push(...tableLines);
          processedLines.push('');
        }
        continue;
      }

      processedLines.push(line);
      i++;
    }

    return processedLines.join('\n');
  };

  const isTableLine = (line: string): boolean => {
    return line.includes('|') && (line.split('|').length > 3);
  };

  const renderContent = (content: string) => {
    const formattedContent = preprocessContent(content);

    return (
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkEmoji, remarkBreaks]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-3xl font-bold text-white mb-6 mt-0 pb-3 border-b border-white/20">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-2xl font-semibold text-white mb-4 mt-6 flex items-center">
                <span className="w-1 h-6 bg-primary-400 mr-3 rounded-full" />
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-xl font-medium text-white mb-3 mt-5">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-white/90 leading-relaxed mb-4 text-base">
                {children}
              </p>
            ),
            // ... rest of the markdown components
          }}
        >
          {formattedContent}
        </ReactMarkdown>
      </div>
    );
  };

  const hasContent = displayContent.length > 0 || singleProductResult || multipleProducts.length > 0 || noResultsFound;

  if (!hasContent && !isStreaming) {
    return null;
  }

  return (
    <>
      {/* Main Results - Slide animation when contributions panel opens */}
      <motion.div
        animate={{ 
          x: showContributions ? -400 : 0,
          opacity: showContributions ? 0.7 : 1 
        }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full max-w-5xl mx-auto"
      >
        <GlassCard className="p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center">
                <Database className="h-6 w-6 text-primary-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {isStreaming && stageMessage ? stageMessage : (isStreaming ? 'Searching...' : 'Search Results')}
                </h3>
                {currentQuery && (
                  <p className="text-white/60 text-sm mt-1">"{currentQuery}"</p>
                )}
                {selectedProduct && (
                  <p className="text-primary-400 text-sm mt-1">Selected: {selectedProduct}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {(singleProductResult || displayContent) && !isStreaming && (
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={handleCopyResults}
                    title="Copy Results"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {singleProductResult && (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={handleShare}
                      title="Email Results"
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          {isStreaming && !hasContent ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary-400 mx-auto mb-4" />
                <p className="text-white/70 text-lg">{stageMessage || 'Processing your request...'}</p>
              </div>
            </div>
          ) : (
            <div
              ref={contentRef}
              className="overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent pr-4"
            >
              {noResultsFound && renderNoResults()}
              {singleProductResult && renderSingleProductResult(singleProductResult)}
              {multipleProducts.length > 0 && renderMultipleProducts(multipleProducts)}
              {!noResultsFound && !singleProductResult && multipleProducts.length === 0 && displayContent && renderContent(displayContent)}

              {isStreaming && hasContent && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="inline-block w-2 h-5 bg-primary-400 ml-1 rounded-full"
                />
              )}
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Enhanced Contributions Panel */}
      <AnimatePresence>
        {showContributions && singleProductResult && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed right-0 top-0 h-full w-[450px] bg-black/80 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Users className="h-5 w-5 text-primary-400" />
                  <span>Community Contributions</span>
                  {contributions.length > 0 && (
                    <span className="px-2 py-1 bg-primary-500/20 text-primary-400 text-xs rounded-full">
                      {contributions.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={handleCloseContributions}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-white/60">
                Document: {singleProductResult.source_document.filename}
              </p>
            </div>

            {/* Add Contribution */}
            <div className="p-4 border-b border-white/10">
              <textarea
                value={contributionText}
                onChange={(e) => setContributionText(e.target.value)}
                placeholder="Share your insights about this document..."
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 
                         focus:outline-none focus:border-primary-400 resize-none"
                rows={3}
              />
              <Button
                variant="primary"
                size="sm"
                className="mt-2 w-full"
                onClick={handleSubmitContribution}
                disabled={!contributionText.trim() || isSubmittingContribution}
                loading={isSubmittingContribution}
              >
                Submit Contribution
              </Button>
            </div>

            {/* Contributions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingContributions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
                </div>
              ) : contributions.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 text-sm">No contributions yet</p>
                  <p className="text-white/40 text-xs mt-2">Be the first to contribute!</p>
                </div>
              ) : (
                contributions.map((contribution) => (
                  <motion.div
                    key={contribution.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                          <span className="text-xs text-primary-400 font-semibold">
                            {contribution.username[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{contribution.username}</p>
                          <p className="text-xs text-white/40">
                            {new Date(contribution.created_at).toLocaleString()}
                            {contribution.is_edited && ' (edited)'}
                          </p>
                        </div>
                      </div>
                      {contribution.can_edit && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              setEditingContribution(contribution.id);
                              setEditText(contribution.content);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
                            title="Edit"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteContribution(contribution.id)}
                            className="p-1 rounded hover:bg-white/10 text-red-400 hover:text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {editingContribution === contribution.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full p-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                          rows={3}
                        />
                        <div className="flex space-x-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleEditContribution(contribution.id)}
                          >
                            Save
                          </Button>
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={() => {
                              setEditingContribution(null);
                              setEditText('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-white/80 text-sm mb-3">{contribution.content}</p>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => handleLikeToggle(contribution)}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-full transition-all ${
                              contribution.user_liked
                                ? 'bg-red-500/20 text-red-400'
                                : 'hover:bg-white/10 text-white/60 hover:text-white'
                            }`}
                          >
                            <motion.div
                              animate={animatingHearts.has(contribution.id) ? {
                                scale: [1, 1.3, 1],
                                rotate: [0, -10, 10, 0]
                              } : {}}
                              transition={{ duration: 0.6 }}
                            >
                              <Heart 
                                className={`h-4 w-4 ${
                                  contribution.user_liked ? 'fill-current' : ''
                                }`} 
                              />
                            </motion.div>
                            <span className="text-xs font-medium">{contribution.like_count}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS for numbered lists and tables */}
      <style jsx global>{`
        .counter-reset-list {
          counter-reset: list-counter;
        }
        .counter-increment-list {
          counter-increment: list-counter;
        }
        .counter-list::before {
          content: counter(list-counter) ".";
          color: rgb(147 51 234);
          font-weight: 600;
        }
      `}</style>
    </>
  );
};