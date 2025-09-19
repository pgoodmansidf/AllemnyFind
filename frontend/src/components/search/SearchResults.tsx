// SearchResults.tsx - COMPLETE FULL WORKING CODE WITH STREAMING ENHANCEMENT

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
  Share,
  Star,
  Users,
  Heart,
  Edit2,
  Trash2,
  X,
  Filter,
  Building2,
  MapPin,
  Hash,
  Factory,
  ChevronLeft,
  ChevronUp,
  CalendarDays,
  Info,
  Crown,
  Shield
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/store/searchStore';
import { useAuthStore } from '@/store/authStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import remarkBreaks from 'remark-breaks';
import toast from 'react-hot-toast';
import { searchApi } from '@/services/searchApi';
import { starsApi, Contribution } from '@/services/starsApi';

interface Producer {
  company: string;
  type: string;
  details: string;
}

interface Occurrence {
  projects: Array<{
    sau_number: string;
    project_name: string;
    city: string;
    source: string;
  }>;
  companies: string[];
  total_occurrences: number;
}

interface ProductResult {
  product: string;
  domain: string;
  cited_definition: string;
  ai_definition: string;
  producers?: Producer[];
  occurrences?: Occurrence;
  source_document: {
    document_id: string;
    filename: string;
    modification_date: string | Date | null;
    relative_date: string;
    main_tag: string;
    file_size: number;
    main_city?: string;
    companies?: string[];
    project_date?: string;
    project_number?: string[];
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
    main_city?: string;
    companies?: string[];
    project_date?: string;
    project_number?: string[];
  };
}

interface FilterOptions {
  product_tags?: string[];
  project_name?: string;
  main_city?: string;
  companies?: string[];
}

interface AvailableFilters {
  product_tags: string[];
  project_names: string[];
  main_cities: string[];
  companies?: string[];
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
  onFilterChange?: (filters: FilterOptions) => void;
  availableFilters?: AvailableFilters;
  interpretation?: string;
}

// Section identifiers for streaming effect
const SECTIONS = {
  HEADER: 'header',
  AI_DEFINITION: 'ai_definition',
  PRODUCERS: 'producers',
  OCCURRENCES: 'occurrences',
  SOURCE_DOCUMENT: 'source_document'
};

// Skeleton loader component
const SectionSkeleton: React.FC<{ 
  height?: string; 
  lines?: number;
  showIcon?: boolean;
  icon?: React.ReactNode;
}> = ({ height = "120px", lines = 3, showIcon = true, icon }) => (
  <div 
    className="animate-pulse bg-white/5 rounded-lg border border-white/10 overflow-hidden" 
    style={{ minHeight: height }}
  >
    <div className="p-6 space-y-4">
      {showIcon && (
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            {icon || <div className="w-5 h-5 bg-white/20 rounded" />}
          </div>
          <div className="h-5 bg-white/10 rounded w-32"></div>
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i} 
            className="h-3 bg-white/10 rounded"
            style={{ width: `${Math.max(40, 100 - (i * 15))}%` }}
          ></div>
        ))}
      </div>
    </div>
  </div>
);

// Typewriter effect component
const TypewriterText: React.FC<{ 
  text: string; 
  speed?: number;
  onComplete?: () => void;
}> = ({ text, speed = 15, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  
  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);
  
  return (
    <span>
      {displayedText}
      {currentIndex < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-primary-400 ml-0.5 align-middle"
        />
      )}
    </span>
  );
};

export const SearchResults: React.FC<SearchResultsProps> = ({
  streamingContent,
  isStreaming = false,
  stageMessage = '',
  documentGroups = {},
  responseType,
  productData,
  productList,
  onProductSelection,
  onFilterChange,
  availableFilters,
  interpretation
}) => {
  const { searchResults, currentQuery, addComment } = useSearchStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
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
  const [queryInterpretation, setQueryInterpretation] = useState<string>(interpretation || '');
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  
  // Streaming effect states
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [sectionLoadingStates, setSectionLoadingStates] = useState<Record<string, boolean>>({});
  const [typewriterComplete, setTypewriterComplete] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<FilterOptions>({});
  const [localAvailableFilters, setLocalAvailableFilters] = useState<AvailableFilters>(
    availableFilters || { product_tags: [], project_names: [], main_cities: [], companies: [] }
  );
  
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
  const [showDocumentSummary, setShowDocumentSummary] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Streaming effect for single product result
  useEffect(() => {
    if (singleProductResult && !isLoadingProduct && isInitialLoad) {
      // Reset all states for fresh animation
      setVisibleSections(new Set());
      setSectionLoadingStates({
        [SECTIONS.HEADER]: true,
        [SECTIONS.AI_DEFINITION]: true,
        [SECTIONS.PRODUCERS]: true,
        [SECTIONS.OCCURRENCES]: true,
        [SECTIONS.SOURCE_DOCUMENT]: true
      });
      setTypewriterComplete(false);

      // Define timing for each section
      const sectionTimings = [
        { section: SECTIONS.HEADER, showDelay: 0, loadDelay: 400 },
        { section: SECTIONS.AI_DEFINITION, showDelay: 300, loadDelay: 700 },
        { section: SECTIONS.PRODUCERS, showDelay: 600, loadDelay: 1200 },
        { section: SECTIONS.OCCURRENCES, showDelay: 900, loadDelay: 1600 },
        { section: SECTIONS.SOURCE_DOCUMENT, showDelay: 1200, loadDelay: 2000 }
      ];

      const timeouts: NodeJS.Timeout[] = [];

      // Schedule section appearances
      sectionTimings.forEach(({ section, showDelay, loadDelay }) => {
        // Show skeleton
        timeouts.push(
          setTimeout(() => {
            setVisibleSections(prev => new Set(prev).add(section));
          }, showDelay)
        );

        // Replace skeleton with content
        if (section !== SECTIONS.AI_DEFINITION) {
          timeouts.push(
            setTimeout(() => {
              setSectionLoadingStates(prev => ({ ...prev, [section]: false }));
            }, loadDelay)
          );
        }
      });

      // Special handling for AI definition to wait for typewriter
      timeouts.push(
        setTimeout(() => {
          setSectionLoadingStates(prev => ({ ...prev, [SECTIONS.AI_DEFINITION]: false }));
        }, 700)
      );

      // Mark initial load complete after all animations
      timeouts.push(
        setTimeout(() => {
          setIsInitialLoad(false);
        }, 2500)
      );

      return () => timeouts.forEach(clearTimeout);
    } else if (singleProductResult && !isLoadingProduct && !isInitialLoad) {
      // For subsequent loads, show everything immediately
      setVisibleSections(new Set([
        SECTIONS.HEADER,
        SECTIONS.AI_DEFINITION,
        SECTIONS.PRODUCERS,
        SECTIONS.OCCURRENCES,
        SECTIONS.SOURCE_DOCUMENT
      ]));
      setSectionLoadingStates({
        [SECTIONS.HEADER]: false,
        [SECTIONS.AI_DEFINITION]: false,
        [SECTIONS.PRODUCERS]: false,
        [SECTIONS.OCCURRENCES]: false,
        [SECTIONS.SOURCE_DOCUMENT]: false
      });
      setTypewriterComplete(true);
    }
  }, [singleProductResult, isLoadingProduct, isInitialLoad]);

  // Reset initial load state when product changes
  useEffect(() => {
    if (isLoadingProduct) {
      setIsInitialLoad(true);
    }
  }, [isLoadingProduct]);

  // Update interpretation when received
  useEffect(() => {
    if (interpretation) {
      setQueryInterpretation(interpretation);
    }
  }, [interpretation]);

  // Update available filters when received
  useEffect(() => {
    if (availableFilters) {
      setLocalAvailableFilters(availableFilters);
    }
  }, [availableFilters]);

  // Check star status and contributions count when single product result is loaded
  useEffect(() => {
    const checkDocumentStatus = async () => {
      if (singleProductResult?.source_document?.document_id) {
        try {
          const starStatus = await starsApi.getDocumentStarStatus(singleProductResult.source_document.document_id);
          setIsStarred(starStatus.is_starred);
          
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
      setIsLoadingProduct(false);
    } else if (responseType === 'single_result' && productData) {
      setSingleProductResult(productData);
      setMultipleProducts([]);
      setNoResultsFound(false);
      setIsLoadingProduct(false);
    } else if (responseType === 'multiple_results' && productList) {
      setMultipleProducts(productList);
      setSingleProductResult(null);
      setNoResultsFound(false);
      setIsLoadingProduct(false);
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

  // Derive available SAU numbers and cities from current results
  useEffect(() => {
    const sauSet = new Set<string>();
    const citySet = new Set<string>();

    const addIfValid = (value?: string) => {
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      return null;
    };

    if (singleProductResult) {
      singleProductResult.occurrences?.projects?.forEach((p) => {
        const sau = addIfValid(p.sau_number);
        if (sau) sauSet.add(sau);
        const city = addIfValid(p.city);
        if (city) citySet.add(city);
      });
      singleProductResult.source_document.project_number?.forEach((num) => {
        const n = addIfValid(num);
        if (n) sauSet.add(n);
      });
      const scity = addIfValid(singleProductResult.source_document.main_city);
      if (scity) citySet.add(scity);
    }

    multipleProducts.forEach((p) => {
      p.sample_document.project_number?.forEach((num) => {
        const n = addIfValid(num);
        if (n) sauSet.add(n);
      });
      const city = addIfValid(p.sample_document.main_city);
      if (city) citySet.add(city);
    });

    Object.values(localDocumentGroups || {}).forEach((group: any) => {
      if (Array.isArray(group)) {
        group.forEach((doc: any) => {
          if (Array.isArray(doc?.project_number)) {
            doc.project_number.forEach((num: any) => {
              const n = addIfValid(String(num));
              if (n) sauSet.add(n);
            });
          }
          const city = addIfValid(doc?.main_city);
          if (city) citySet.add(city);
          const docSau = addIfValid(doc?.sau_number);
          if (docSau) sauSet.add(docSau);
          if (doc?.occurrences?.projects && Array.isArray(doc.occurrences.projects)) {
            doc.occurrences.projects.forEach((proj: any) => {
              const pn = addIfValid(proj?.sau_number);
              if (pn) sauSet.add(pn);
              const pcity = addIfValid(proj?.city);
              if (pcity) citySet.add(pcity);
            });
          }
        });
      }
    });

    setLocalAvailableFilters((prev) => ({
      ...prev,
      project_names: Array.from(sauSet).sort((a, b) => a.localeCompare(b)),
      main_cities: Array.from(citySet).sort((a, b) => a.localeCompare(b)),
    }));
  }, [singleProductResult, multipleProducts, localDocumentGroups]);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayContent, isStreaming]);

  // Handle scroll to top visibility
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setShowScrollToTop(contentRef.current.scrollTop > 300);
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('scroll', handleScroll);
      return () => contentElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFilterApply = () => {
    if (onFilterChange) {
      onFilterChange(selectedFilters);
    }
    toast.success('Filters applied');
  };

  const handleFilterClear = () => {
    setSelectedFilters({});
    if (onFilterChange) {
      onFilterChange({});
    }
    toast.success('Filters cleared');
  };

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
      setShowContributions(false);
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
      setShowContributions(false);
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
      setShowContributions(false);
    } catch (error) {
      console.error('Error deleting contribution:', error);
      toast.error('Failed to delete contribution');
    }
  };

  const handleLikeToggle = async (contribution: Contribution) => {
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
    
    setSingleProductResult(null);
    setMultipleProducts([]);
    setNoResultsFound(false);
    setIsLoadingProduct(true);
    setDisplayContent('');
    setIsInitialLoad(true);
    
    if (onProductSelection) {
      onProductSelection(product);
    } else {
      console.error('onProductSelection callback not provided');
      toast.error('Unable to analyze product - callback not configured');
      setIsLoadingProduct(false);
    }
  };

  const handleDeleteProductTag = async (product: string) => {
    if (!isAdmin) return;
    
    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="bg-gray-900 rounded-lg p-6 max-w-md border border-white/20">
          <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
            <svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            Delete Product Tag
          </h3>
          <p class="text-white/80 mb-6">Are you sure you want to delete the product tag "<span class="font-semibold text-red-400">${product}</span>"? This action cannot be undone.</p>
          <div class="flex space-x-3">
            <button id="delete-confirm" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">Delete</button>
            <button id="delete-cancel" class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      document.getElementById('delete-confirm')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });
      
      document.getElementById('delete-cancel')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
    });
    
    if (confirmed) {
      try {
        await searchApi.deleteProductTag(product);
        toast.success(`Product tag "${product}" deleted successfully`);
        setMultipleProducts(multipleProducts.filter(p => p.product !== product));
      } catch (error) {
        console.error('Error deleting product tag:', error);
        toast.error('Failed to delete product tag');
      }
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

      // Format as dd/mm/yyyy
      const day = dateObj.getDate().toString().padStart(2, '0');
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const year = dateObj.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return 'Date not available';
    }
  };

  const formatResultsForCopy = (): string => {
    if (singleProductResult) {
      let result = `
${singleProductResult.product}

GENERATED BY ALLEMNY:
${singleProductResult.ai_definition}
`;

      if (singleProductResult.producers && singleProductResult.producers.length > 0) {
        result += '\n\nPRODUCERS/COMPETITORS:\n';
        singleProductResult.producers.forEach(p => {
          result += `- ${p.company} (${p.type}): ${p.details}\n`;
        });
      }

      if (singleProductResult.occurrences) {
        result += '\n\nOCCURRENCES:\n';
        if (singleProductResult.occurrences.projects.length > 0) {
          result += 'Projects:\n';
          singleProductResult.occurrences.projects.forEach(p => {
            result += `- SAU ${p.sau_number}: ${p.project_name} (${p.city})\n`;
          });
        }
        if (singleProductResult.occurrences.companies.length > 0) {
          result += 'Companies:\n';
          result += singleProductResult.occurrences.companies.join(', ');
        }
      }

      result += `

SOURCE DOCUMENT:
File: ${singleProductResult.source_document.filename}
Modified: ${formatDate(singleProductResult.source_document.modification_date)} (${singleProductResult.source_document.relative_date})
Document Type: ${singleProductResult.source_document.main_tag}
City: ${singleProductResult.source_document.main_city || 'N/A'}
Companies: ${singleProductResult.source_document.companies?.join(', ') || 'N/A'}
Project Numbers: ${singleProductResult.source_document.project_number?.join(', ') || 'N/A'}${isAdmin ? `\nChunks Analyzed: ${singleProductResult.chunks_used}` : ''}
      `.trim();
      
      return result;
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
    const shareMethod = await new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="bg-gray-900 rounded-lg p-6 max-w-md border border-white/20">
          <h3 class="text-lg font-semibold text-white mb-4">Share Results</h3>
          <p class="text-white/80 mb-6">How would you like to share these results?</p>
          <div class="space-y-3">
            <button id="share-email" class="w-full px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors">
              Open Outlook
            </button>
            <button id="share-copy" class="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors">
              Copy to Clipboard for Manual Email
            </button>
            <button id="share-cancel" class="px-4 py-2 w-full bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      document.getElementById('share-email')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve('email');
      });
      
      document.getElementById('share-copy')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve('copy');
      });
      
      document.getElementById('share-cancel')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve('cancel');
      });
    });

    if (shareMethod === 'cancel') return;

    const subject = singleProductResult?.product || currentQuery || 'Search Results';
    const body = formatResultsForCopy();

    if (shareMethod === 'email') {
      const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
    } else if (shareMethod === 'copy') {
      const emailContent = `Subject: ${subject}\n\n${body}`;
      try {
        await navigator.clipboard.writeText(emailContent);
        toast.success('Results copied! Paste into your email client.', { duration: 4000 });
      } catch (error) {
        toast.error('Failed to copy results');
      }
    }
  };

  const renderSingleProductResult = (result: ProductResult) => {
    if (!result || !result.product) {
      return (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Invalid Result Data</h3>
          <p className="text-white/60">The search result data is incomplete or corrupted.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Product Header Section */}
        {visibleSections.has(SECTIONS.HEADER) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {sectionLoadingStates[SECTIONS.HEADER] ? (
              <SectionSkeleton height="140px" lines={2} icon={<Package className="h-5 w-5 text-primary-400" />} />
            ) : (
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-lg border border-primary-500/30">
                <div className="flex items-center space-x-4">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center"
                  >
                    <Package className="h-7 w-7 text-primary-400" />
                  </motion.div>
                  <div>
                    <motion.h2 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-2xl font-bold text-white"
                    >
                      {result.product}
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-white/60 text-sm mt-1"
                    >
                      Domain: {result.domain}
                    </motion.p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isAdmin && (
                    <motion.span 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 }}
                      className="px-3 py-1 bg-primary-500/20 border border-primary-500/30 rounded-full text-xs text-primary-300"
                    >
                      {result.chunks_used} chunks analyzed
                    </motion.span>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* AI Generated Definition Section */}
        {visibleSections.has(SECTIONS.AI_DEFINITION) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {sectionLoadingStates[SECTIONS.AI_DEFINITION] ? (
              <SectionSkeleton height="150px" lines={4} icon={<Brain className="h-5 w-5 text-purple-400" />} />
            ) : (
              <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center space-x-2 mb-4"
                >
                  <Brain className="h-5 w-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Generated By Allemny</h3>
                  <span className="px-2 py-1 bg-purple-500/20 rounded text-xs text-purple-300 flex items-center space-x-1">
                    <Sparkles className="h-3 w-3" />
                    <span>AI Generated</span>
                  </span>
                </motion.div>
                <div className="text-white/90 leading-relaxed">
                  {typewriterComplete ? (
                    result.ai_definition
                  ) : (
                    <TypewriterText 
                      text={result.ai_definition} 
                      speed={10}
                      onComplete={() => setTypewriterComplete(true)}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Producers Section */}
        {visibleSections.has(SECTIONS.PRODUCERS) && result.producers !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {sectionLoadingStates[SECTIONS.PRODUCERS] ? (
              <SectionSkeleton height="200px" lines={5} icon={<Factory className="h-5 w-5 text-orange-400" />} />
            ) : (
              <div className="p-6 bg-white/5 rounded-lg border border-white/10">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center space-x-2 mb-4"
                >
                  <Factory className="h-5 w-5 text-orange-400" />
                  <h3 className="text-lg font-semibold text-white">Associated Entities</h3>
                </motion.div>
                {result.producers && result.producers.length > 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="overflow-x-auto"
                  >
                    <table className="w-full text-sm text-white">
                      <thead className="text-xs text-white/60 uppercase bg-white/5">
                        <tr>
                          <th className="px-4 py-3 text-left">Company</th>
                          <th className="px-4 py-3 text-left">Type</th>
                          <th className="px-4 py-3 text-left">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {result.producers.map((producer, index) => (
                          <motion.tr 
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium">{producer.company}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                producer.type === 'Competitor' 
                                  ? 'bg-red-500/20 text-red-300' 
                                  : producer.type === 'Manufacturer'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : producer.type === 'Supplier'
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-yellow-500/20 text-yellow-300'
                              }`}>
                                {producer.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white/70">{producer.details}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8 text-white/60"
                  >
                    <Factory className="h-12 w-12 text-white/20 mx-auto mb-3" />
                    <p>No information found about producers or competitors</p>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Occurrence Section */}
        {visibleSections.has(SECTIONS.OCCURRENCES) && result.occurrences && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {sectionLoadingStates[SECTIONS.OCCURRENCES] ? (
              <SectionSkeleton height="250px" lines={6} icon={<Hash className="h-5 w-5 text-cyan-400" />} />
            ) : (
              <div className="p-6 bg-white/5 rounded-lg border border-white/10">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center space-x-2 mb-4"
                >
                  <Hash className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-lg font-semibold text-white">Occurrence</h3>
                  {result.occurrences.total_occurrences > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                      className="px-2 py-1 bg-cyan-500/20 rounded-full text-xs text-cyan-300"
                    >
                      {result.occurrences.total_occurrences} occurrences
                    </motion.span>
                  )}
                </motion.div>
                
                {result.occurrences.total_occurrences > 0 ? (
                  <div className="space-y-4">
                    {/* Projects Section */}
                    {result.occurrences.projects.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span>Projects Using This Product</span>
                        </h4>
                        <div className="grid gap-2 md:grid-cols-2">
                          {result.occurrences.projects.map((project, index) => (
                            <motion.div 
                              key={index}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.4 + index * 0.05 }}
                              className="p-3 bg-black/20 rounded-lg border border-white/10"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    SAU {project.sau_number}
                                  </p>
                                  <p className="text-xs text-white/60 mt-1">
                                    {project.project_name}
                                  </p>
                                  <p className="text-xs text-white/50 mt-1">
                                    {project.city}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Companies Section */}
                    {result.occurrences.companies.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center space-x-2">
                          <Building2 className="h-4 w-4" />
                          <span>Companies Using This Product</span>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {result.occurrences.companies.map((company, index) => (
                            <motion.span 
                              key={index}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.6 + index * 0.05 }}
                              className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-sm text-blue-300"
                            >
                              {company}
                            </motion.span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8 text-white/60"
                  >
                    <Hash className="h-12 w-12 text-white/20 mx-auto mb-3" />
                    <p>No occurrences found in other projects or companies</p>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Source Document Section */}
        {visibleSections.has(SECTIONS.SOURCE_DOCUMENT) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {sectionLoadingStates[SECTIONS.SOURCE_DOCUMENT] ? (
              <SectionSkeleton height="120px" lines={3} icon={<FileText className="h-5 w-5 text-primary-400" />} />
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 bg-black/40 rounded-lg border border-white/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <motion.div
                      initial={{ rotate: -180, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <FileText className="h-6 w-6 text-primary-400" />
                    </motion.div>
                    <div>
                      <motion.h4 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-white font-semibold"
                      >
                        {result.source_document.filename}
                      </motion.h4>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-white/60"
                      >
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {formatDate(result.source_document.modification_date)} 
                            {result.source_document.relative_date && ` (${result.source_document.relative_date})`}
                          </span>
                        </span>
                        
                        {result.source_document.project_number && result.source_document.project_number.length > 0 && (
                          <span className="flex items-center space-x-1">
                            <Hash className="h-3 w-3" />
                            <span>{result.source_document.project_number.join(', ')}</span>
                          </span>
                        )}
                        
                        {result.source_document.project_date && (
                          <span className="flex items-center space-x-1">
                            <CalendarDays className="h-3 w-3" />
                            <span>{new Date(result.source_document.project_date).toLocaleDateString()}</span>
                          </span>
                        )}
                        
                        <span className="flex items-center space-x-1">
                          <Tag className="h-3 w-3" />
                          <span>{result.source_document.main_tag || 'Uncategorized'}</span>
                        </span>
                        
                        <span>{formatFileSize(result.source_document.file_size)}</span>
                      </motion.div>
                    </div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center space-x-2"
                  >
                    <Button
                      variant="glass"
                      size="sm"
                      className="flex items-center justify-center"
                      icon={<Eye className="h-4 w-4" />}
                      onClick={() => setShowDocumentSummary(true)}
                      disabled={!result.source_document.document_id}
                      title="View document summary"
                    />
                    <Button
                      variant="glass"
                      size="sm"
                      className="flex items-center justify-center"
                      icon={isLoadingStar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />}
                      onClick={handleStarToggle}
                      disabled={isLoadingStar || !result.source_document.document_id}
                      title={isStarred ? "Remove from favorites" : "Add to favorites"}
                    />
                    <div className="relative">
                      <Button
                        variant="glass"
                        size="sm"
                        className="flex items-center justify-center"
                        icon={<Users className="h-4 w-4" />}
                        onClick={handleContributeClick}
                        disabled={!result.source_document.document_id}
                        title="View and add contributions"
                      />
                      {contributionsCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-primary-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                          {contributionsCount}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex items-center justify-center"
                      icon={<Download className="h-4 w-4" />}
                      onClick={() => handleDownloadDocument(
                        result.source_document.document_id,
                        result.source_document.filename
                      )}
                      disabled={!result.source_document.document_id}
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    );
  };

  const renderMultipleProducts = (products: ProductListItem[]) => {
    if (!products || products.length === 0) {
      return (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Products Available</h3>
          <p className="text-white/60">The product list is empty or unavailable.</p>
        </div>
      );
    }

    const sortedProducts = [...products].sort((a, b) => b.best_match_score - a.best_match_score);
    const topProduct = sortedProducts[0];
    const relatedProducts = sortedProducts.slice(1);

    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <h2 className="text-2xl font-bold text-white mb-2">Best Match Found</h2>
          <p className="text-white/60">Select the best match to get detailed information or explore related products below</p>
        </div>

        {/* Top Match - Featured Card */}
        {topProduct && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group"
          >
            <div className="p-8 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-lg border border-primary-500/40 
                          hover:from-primary-500/30 hover:to-purple-500/30 transition-all duration-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-primary-500/30 rounded-full flex items-center justify-center 
                                group-hover:bg-primary-500/40 transition-colors">
                    <Crown className="h-7 w-7 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white group-hover:text-primary-300 transition-colors">
                      {topProduct.product}
                    </h3>
                    <div className="flex items-center space-x-3 mt-2">
                      <span className="text-sm text-green-400 font-semibold">
                        {(topProduct.best_match_score * 100).toFixed(0)}% match
                      </span>
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">
                        Best Match
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 text-white/60 group-hover:text-primary-400 
                                       group-hover:translate-x-1 transition-all" />
              </div>

              <div className={`grid ${isAdmin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'} gap-4 mb-6`}>
                <div className="text-center p-3 bg-black/20 rounded-lg">
                  <FileText className="h-5 w-5 text-primary-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-white">{topProduct.document_count}</p>
                  <p className="text-xs text-white/60">Documents</p>
                </div>
                {isAdmin && (
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <FileSearch className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-white">{topProduct.chunk_count}</p>
                    <p className="text-xs text-white/60">Chunks</p>
                  </div>
                )}
                {topProduct.sample_document.main_city && (
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <MapPin className="h-5 w-5 text-cyan-400 mx-auto mb-1" />
                    <p className="text-lg font-semibold text-white truncate">{topProduct.sample_document.main_city}</p>
                    <p className="text-xs text-white/60">Location</p>
                  </div>
                )}
                {topProduct.sample_document.companies && topProduct.sample_document.companies.length > 0 && (
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <Building2 className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-white">{topProduct.sample_document.companies.length}</p>
                    <p className="text-xs text-white/60">Companies</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-6">
                {topProduct.sample_document.project_number && topProduct.sample_document.project_number.length > 0 && (
                  <div className="flex items-center space-x-2 text-sm text-white/70">
                    <Hash className="h-4 w-4 text-white/50" />
                    <span>Projects: {topProduct.sample_document.project_number.join(', ')}</span>
                  </div>
                )}
                
                {topProduct.sample_document.project_date && (
                  <div className="flex items-center space-x-2 text-sm text-white/70">
                    <CalendarDays className="h-4 w-4 text-white/50" />
                    <span>Project Date: {new Date(topProduct.sample_document.project_date).toLocaleDateString()}</span>
                  </div>
                )}
                
                <div className="flex items-center space-x-2 text-sm text-white/70">
                  <FileText className="h-4 w-4 text-white/50" />
                  <span className="truncate">Latest: {topProduct.sample_document.filename}</span>
                </div>
                
                <div className="flex items-center space-x-2 text-sm text-white/70">
                  <Clock className="h-4 w-4 text-white/50" />
                  <span>{topProduct.sample_document.relative_date || 'Date not available'}</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                icon={<Brain className="h-5 w-5" />}
                onClick={() => handleProductButtonClick(topProduct.product)}
              >
                More for {topProduct.product}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Related Products Section */}
        {relatedProducts.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <Package className="h-5 w-5 text-white/60" />
              <span>Related Products</span>
              <span className="px-2 py-1 bg-white/10 text-white/60 text-xs rounded-full">
                {relatedProducts.length}
              </span>
            </h3>

            <div className="space-y-2">
              {relatedProducts.map((item, index) => (
                <motion.div
                  key={`${item.product}-${index}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 
                           hover:bg-white/10 hover:border-primary-500/30 transition-all duration-200"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center 
                                  group-hover:bg-primary-500/20 transition-colors">
                      <Package className="h-5 w-5 text-white/60 group-hover:text-primary-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-medium group-hover:text-primary-300 transition-colors">
                        {item.product}
                      </h4>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-white/50">
                        <span>{(item.best_match_score * 100).toFixed(0)}% match</span>
                        <span>{item.document_count} docs</span>
                        {isAdmin && <span>{item.chunk_count} chunks</span>}
                        {item.sample_document.main_city && (
                          <span className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{item.sample_document.main_city}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isAdmin && (
                      <Button
                        variant="glass"
                        size="sm"
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => handleDeleteProductTag(item.product)}
                        title="Delete product tag (Admin)"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Delete
                      </Button>
                    )}
                    <Button
                      variant="glass"
                      size="sm"
                      icon={<Brain className="h-4 w-4" />}
                      onClick={() => handleProductButtonClick(item.product)}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
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
            {stageMessage || `No documents containing information about "${currentQuery}" were found.`}
          </p>
          <div className="mt-6 space-y-2 text-sm text-white/50">
            <p>Try:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Including at least one: product name, company, city, project number, or date</li>
              <li>Using different or more general search terms</li>
              <li>Searching for related products or topics</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const preprocessContent = (content: string): string => {
    let cleaned = content
      .replace(/â"â".*?â"â""/g, '')
      .replace(/â"£â".*?â"â"«/g, '')
      .replace(/â"ƒ/g, '')
      .replace(/â–°+â–±+/g, '')
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
            ul: ({ children }) => (
              <ul className="list-disc list-inside text-white/90 mb-4 space-y-2 ml-4">
                {children}
              </ul>
            ),
            ol: ({ children, start }) => (
              <ol className="list-decimal list-inside text-white/90 mb-4 space-y-2 ml-4 counter-reset-list" start={start}>
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-white/90 leading-relaxed counter-increment-list">
                {children}
              </li>
            ),
            strong: ({ children }) => (
              <strong className="text-white font-semibold">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="text-white/90 italic">{children}</em>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary-400/50 pl-4 py-2 my-4 text-white/80 italic bg-white/5 rounded-r">
                {children}
              </blockquote>
            ),
            code: ({ inline, children }) => {
              if (inline) {
                return (
                  <code className="px-1.5 py-0.5 bg-white/10 text-primary-300 rounded text-sm font-mono">
                    {children}
                  </code>
                );
              }
              return (
                <code className="block p-4 bg-black/40 text-green-400 rounded-lg overflow-x-auto font-mono text-sm my-4 border border-white/10">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="overflow-x-auto">{children}</pre>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-6">
                <table className="min-w-full divide-y divide-white/20 border border-white/20 rounded-lg overflow-hidden">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-white/10">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/10">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-white/5 transition-colors">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-3 text-sm text-white/90">{children}</td>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:text-primary-300 underline decoration-primary-400/30 hover:decoration-primary-300 transition-colors inline-flex items-center gap-1"
              >
                {children}
                <Link className="h-3 w-3" />
              </a>
            ),
            hr: () => (
              <hr className="my-8 border-white/20" />
            ),
          }}
        >
          {formattedContent}
        </ReactMarkdown>
      </div>
    );
  };

  const hasContent = displayContent.length > 0 || singleProductResult || multipleProducts.length > 0 || noResultsFound;

  if (!hasContent && !isStreaming && !isLoadingProduct) {
    return null;
  }

  if (user === undefined || (user !== null && !user.role)) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <GlassCard className="p-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Authentication Error</h3>
            <p className="text-white/60">Please refresh the page or log in again.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <>
      {/* Filter Sidebar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed left-0 top-0 h-full w-80 bg-black/90 backdrop-blur-xl border-r border-white/10 z-40 flex flex-col"
          >
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Filter className="h-5 w-5 text-primary-400" />
                  <span>Search Filters</span>
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Product Tags Filter */}
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>Products</span>
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {localAvailableFilters.product_tags.map((tag) => (
                    <label key={tag} className="flex items-center space-x-2 cursor-pointer hover:bg-white/5 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedFilters.product_tags?.includes(tag) || false}
                        onChange={(e) => {
                          const newTags = e.target.checked
                            ? [...(selectedFilters.product_tags || []), tag]
                            : (selectedFilters.product_tags || []).filter(t => t !== tag);
                          setSelectedFilters({
                            ...selectedFilters,
                            product_tags: newTags.length > 0 ? newTags : undefined
                          });
                        }}
                        className="w-4 h-4 rounded bg-white/10 border-white/20 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm text-white/70">{tag}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Companies Filter */}
              {localAvailableFilters.companies && localAvailableFilters.companies.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center space-x-2">
                    <Building2 className="h-4 w-4" />
                    <span>Companies</span>
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {localAvailableFilters.companies.map((company) => (
                      <label key={company} className="flex items-center space-x-2 cursor-pointer hover:bg-white/5 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={selectedFilters.companies?.includes(company) || false}
                          onChange={(e) => {
                            const newCompanies = e.target.checked
                              ? [...(selectedFilters.companies || []), company]
                              : (selectedFilters.companies || []).filter(c => c !== company);
                            setSelectedFilters({
                              ...selectedFilters,
                              companies: newCompanies.length > 0 ? newCompanies : undefined
                            });
                          }}
                          className="w-4 h-4 rounded bg-white/10 border-white/20 text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-white/70">{company}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* SAU Number Filter */}
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center space-x-2">
                  <Hash className="h-4 w-4" />
                  <span>SAU Number</span>
                </h4>
                <select
                  value={selectedFilters.project_name || ''}
                  onChange={(e) => setSelectedFilters({
                    ...selectedFilters,
                    project_name: e.target.value || undefined
                  })}
                  className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-primary-400"
                >
                  <option value="">All Projects</option>
                  {localAvailableFilters.project_names.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* City Filter */}
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center space-x-2">
                  <MapPin className="h-4 w-4" />
                  <span>City</span>
                </h4>
                <select
                  value={selectedFilters.main_city || ''}
                  onChange={(e) => setSelectedFilters({
                    ...selectedFilters,
                    main_city: e.target.value || undefined
                  })}
                  className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-primary-400"
                >
                  <option value="">All Cities</option>
                  {localAvailableFilters.main_cities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 space-y-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleFilterApply}
              >
                Apply Filters
              </Button>
              <Button
                variant="glass"
                size="sm"
                className="w-full"
                onClick={handleFilterClear}
              >
                Clear All
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Results */}
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
                  {isStreaming && stageMessage ? stageMessage : (isStreaming ? 'Searching...' : isLoadingProduct ? 'Analyzing Product...' : 'Search Results')}
                </h3>
                {currentQuery && (
                  <p className="text-white/60 text-sm mt-1">"{currentQuery}"</p>
                )}
                {selectedProduct && (
                  <p className="text-primary-400 text-sm mt-1">Viewing: {selectedProduct}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center space-x-1">
                  <Shield className="h-3 w-3 text-amber-400" />
                  <span className="text-xs text-amber-300">Admin</span>
                </div>
              )}
              
              {(singleProductResult || displayContent) && !isStreaming && !isLoadingProduct && (
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
                      title="Share Results"
                    >
                      <Share className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Query Interpretation Banner */}
          {queryInterpretation && !isLoadingProduct && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg"
            >
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-300">Query Interpretation</p>
                  <p className="text-sm text-white/80 mt-1">{queryInterpretation}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Main Content Area */}
          {(isStreaming && !hasContent) || isLoadingProduct ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary-400 mx-auto mb-4" />
                <p className="text-white/70 text-lg">
                  {isLoadingProduct 
                    ? `Getting more for ${selectedProduct}...` 
                    : (stageMessage || 'One moment please...')}
                </p>
                {isLoadingProduct && (
                  <p className="text-white/50 text-sm mt-2">This may take a few moments</p>
                )}
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

      {/* Contributions Panel */}
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
                Share Contribution
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

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollToTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-40 p-3 bg-primary-500/20 backdrop-blur-xl border border-primary-500/30 rounded-full text-primary-400 hover:bg-primary-500/30 hover:text-primary-300 transition-all duration-200"
            title="Scroll to top"
          >
            <ChevronUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Document Summary Modal */}
      <AnimatePresence>
        {showDocumentSummary && singleProductResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setShowDocumentSummary(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl"
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <Eye className="h-5 w-5 text-primary-400" />
                    <span>Document Summary</span>
                  </h3>
                  <button
                    onClick={() => setShowDocumentSummary(false)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">
                      {singleProductResult.source_document.filename}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/60">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>Modified: {formatDate(singleProductResult.source_document.modification_date)}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Tag className="h-3 w-3" />
                        <span>{singleProductResult.source_document.main_tag || 'Uncategorized'}</span>
                      </span>
                      <span>{formatFileSize(singleProductResult.source_document.file_size)}</span>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-white font-medium mb-2 flex items-center space-x-2">
                      <Brain className="h-4 w-4 text-purple-400" />
                      <span>AI Summary</span>
                    </h5>
                    <p className="text-white/80 text-sm leading-relaxed">{singleProductResult.ai_definition}</p>
                  </div>

                  {singleProductResult.source_document.main_city && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Location:</span>
                        <p className="text-white font-medium">{singleProductResult.source_document.main_city}</p>
                      </div>
                      {singleProductResult.source_document.companies && singleProductResult.source_document.companies.length > 0 && (
                        <div>
                          <span className="text-white/60">Companies:</span>
                          <p className="text-white font-medium">{singleProductResult.source_document.companies.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center space-x-3 pt-4 border-t border-white/10">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => handleDownloadDocument(singleProductResult.source_document.document_id, singleProductResult.source_document.filename)}
                      icon={<Download className="h-4 w-4" />}
                    >
                      Download Document
                    </Button>
                    <Button
                      variant="glass"
                      className="flex-1"
                      onClick={() => setShowDocumentSummary(false)}
                      icon={<X className="h-4 w-4" />}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{
        __html: `
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
        `
      }} />
    </>
  );
};