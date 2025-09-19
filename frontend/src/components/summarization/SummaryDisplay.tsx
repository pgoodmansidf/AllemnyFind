import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  Download,
  Star,
  Share2,
  Loader2,
  TrendingUp,
  BarChart3,
  Target,
  FileText,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Check,
  FileBarChart,
  Info
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { DetailedSummaryResponse } from '@/services/summarizationApi';
import { useSummarizationStore } from '@/store/summarizationStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

interface SummaryDisplayProps {
  content: string;
  summary: DetailedSummaryResponse | null;
  isStreaming: boolean;
  currentStage: string;
}

// Function to convert data patterns to tables
const convertDataToTable = (text: string): string => {
  // Pattern to detect data like "City: 2018 - x/y/z | 2020 - a/b/c"
  const dataPattern = /^(•\s+)?([A-Za-z]+):\s*(\d{4})\s*[–\-]\s*([\d,]+)\s*\/\s*([\d,]+)\s*\/\s*([\d,]+)(?:\s*\|\s*(\d{4})\s*[–\-]\s*([\d,]+)\s*\/\s*([\d,]+)\s*\/\s*([\d,]+))?/gm;
  
  let hasMatches = false;
  const matches: any[] = [];
  let match;
  
  while ((match = dataPattern.exec(text)) !== null) {
    hasMatches = true;
    matches.push({
      city: match[2],
      year1: match[3],
      delivered1: match[4],
      sold1: match[5],
      waste1: match[6],
      year2: match[7] || null,
      delivered2: match[8] || null,
      sold2: match[9] || null,
      waste2: match[10] || null
    });
  }
  
  if (hasMatches && matches.length > 0) {
    // Build table
    let table = '\n\n| City | Year | Delivered | Sold | Waste |\n';
    table += '|------|------|-----------|------|-------|\n';
    
    matches.forEach(m => {
      table += `| ${m.city} | ${m.year1} | ${m.delivered1} | ${m.sold1} | ${m.waste1} |\n`;
      if (m.year2) {
        table += `| ${m.city} | ${m.year2} | ${m.delivered2} | ${m.sold2} | ${m.waste2} |\n`;
      }
    });
    
    // Replace the original text with the table
    text = text.replace(dataPattern, '');
    text = text.replace(/^(•\s*)+$/gm, ''); // Remove empty bullet points
    
    // Find where to insert the table
    const insertPoint = text.indexOf('**Data & Statistics:**');
    if (insertPoint > -1) {
      const afterHeader = text.indexOf('\n', insertPoint) + 1;
      text = text.slice(0, afterHeader) + table + '\n' + text.slice(afterHeader);
    } else {
      text += table;
    }
  }
  
  // Also detect more flexible data patterns
  const flexibleDataPattern = /([A-Za-z]+)[:\s]+.*?(\d{4})[^\d]+([\d,]+)\s*\/\s*([\d,]+)\s*\/\s*([\d,]+)[^\d]*(?:\|\s*(\d{4})[^\d]+([\d,]+)\s*\/\s*([\d,]+)\s*\/\s*([\d,]+))?/g;
  
  // Check for multiple data points that should be in a table
  const dataLines = text.split('\n').filter(line => 
    line.includes('/') && 
    (line.match(/\d+\s*\/\s*\d+/g) || []).length >= 2
  );
  
  if (dataLines.length >= 3 && !hasMatches) {
    // Convert these lines to a table format
    const tableData: any[] = [];
    
    dataLines.forEach(line => {
      // Clean the line
      const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
      
      // Try to extract city/label and data points
      const cityMatch = cleanLine.match(/^([A-Za-z]+)[:\s]+/);
      if (cityMatch) {
        const city = cityMatch[1];
        const remaining = cleanLine.substring(cityMatch[0].length);
        
        // Extract year-data pairs
        const yearDataPattern = /(\d{4})[^\d]+([\d,]+)\s*\/\s*([\d,]+)\s*\/\s*([\d,]+)/g;
        let yearDataMatch;
        
        while ((yearDataMatch = yearDataPattern.exec(remaining)) !== null) {
          tableData.push({
            city: city,
            year: yearDataMatch[1],
            delivered: yearDataMatch[2],
            sold: yearDataMatch[3],
            waste: yearDataMatch[4]
          });
        }
      }
    });
    
    if (tableData.length > 0) {
      // Build formatted table
      let formattedTable = '\n\n| Location | Year | Delivered | Sold | Waste |\n';
      formattedTable += '|----------|------|-----------|------|-------|\n';
      
      tableData.forEach(row => {
        formattedTable += `| ${row.city} | ${row.year} | ${row.delivered} | ${row.sold} | ${row.waste} |\n`;
      });
      
      // Replace the original lines with the table
      dataLines.forEach(line => {
        text = text.replace(line, '');
      });
      
      // Clean up empty lines
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // Add the table
      text += formattedTable;
    }
  }
  
  return text;
};

export const SummaryDisplay: React.FC<SummaryDisplayProps> = ({
  content,
  summary,
  isStreaming,
  currentStage
}) => {
  const { toggleSummaryStar } = useSummarizationStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['full']));
  const [copied, setCopied] = useState(false);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleCopy = async () => {
    const textToCopy = summary ? summary.full_summary : content;
    if (!textToCopy) {
      toast.error('No content to copy');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success('Summary copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = () => {
    const textToDownload = summary ? summary.full_summary : content;
    if (!textToDownload) {
      toast.error('No content to download');
      return;
    }
    
    const blob = new Blob([textToDownload], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary_${summary?.id || Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Summary downloaded');
  };

  const handleShare = () => {
    const subject = encodeURIComponent(summary?.title || 'Document Summary');
    const body = encodeURIComponent(summary?.full_summary || content || '');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleStarToggle = async () => {
    if (!summary?.id) {
      toast.error('Cannot star unsaved summary');
      return;
    }
    
    try {
      await toggleSummaryStar(summary.id);
    } catch (error) {
      toast.error('Failed to toggle star');
    }
  };

  // Show loading state
  if (isStreaming && !content) {
    return (
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary-400 mb-4" />
          <p className="text-white/70 text-lg">{currentStage || 'Processing...'}</p>
        </div>
      </GlassCard>
    );
  }

  // Check if we have any content to display
  if (!content && !summary) {
    return null;
  }

  // Custom markdown components for business formatting
  const markdownComponents = {
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold text-white mb-4 mt-6 pb-2 border-b border-white/20">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold text-white mb-3 mt-5">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-medium text-white mb-2 mt-4">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="text-white mb-3 leading-relaxed">
        {children}
      </p>
    ),
    strong: ({ children }: any) => (
      <strong className="text-white font-semibold">
        {children}
      </strong>
    ),
    em: ({ children }: any) => (
      <em className="text-white/90 italic">
        {children}
      </em>
    ),
    ul: ({ children }: any) => (
      <ul className="list-none space-y-2 mb-4 ml-0">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside space-y-2 mb-4 ml-4 text-white">
        {children}
      </ol>
    ),
    li: ({ children }: any) => {
      // Check if this is a bullet point or numbered list
      const isUnordered = children && typeof children === 'string' ? false : true;
      return (
        <li className="text-white flex items-start">
          <span className="text-primary-400 mr-2 mt-1">•</span>
          <span className="flex-1">{children}</span>
        </li>
      );
    },
    table: ({ children }: any) => (
      <div className="overflow-x-auto mb-6">
        <table className="min-w-full divide-y divide-white/20">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-white/10">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-white/10">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-white/5 transition-colors">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-3 text-sm text-white">
        {children}
      </td>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary-400 pl-4 py-2 mb-4 bg-white/5 rounded-r">
        <p className="text-white/90 italic">{children}</p>
      </blockquote>
    ),
    code: ({ inline, children }: any) => {
      if (inline) {
        return (
          <code className="px-1.5 py-0.5 bg-white/10 text-primary-300 rounded text-sm font-mono">
            {children}
          </code>
        );
      }
      return (
        <pre className="bg-black/30 border border-white/10 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-white font-mono text-sm">{children}</code>
        </pre>
      );
    },
    hr: () => (
      <hr className="border-white/20 my-6" />
    ),
    a: ({ href, children }: any) => (
      <a 
        href={href} 
        className="text-primary-400 hover:text-primary-300 underline transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  };

  // Process content to ensure proper formatting for business documents
  const processContent = (text: string): string => {
    if (!text) return '';
    
    // Convert data patterns to tables FIRST
    text = convertDataToTable(text);
    
    // Ensure bullet points are properly formatted
    text = text.replace(/^[-*]\s+/gm, '• ');
    text = text.replace(/^(\d+)\.\s+/gm, '$1. ');
    
    // Format citations properly
    text = text.replace(/\[(\d+)\]/g, '<sup class="text-primary-300">[$1]</sup>');
    text = text.replace(/\(([^)]+,\s*\d{4})\)/g, '<cite class="text-white/70">($1)</cite>');
    
    // Ensure proper spacing for sections
    text = text.replace(/\n\*\*([^*]+)\*\*\s*\n/g, '\n\n**$1**\n\n');
    
    return text;
  };

  return (
    <GlassCard className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            {summary?.title || 'Summary Results'}
          </h2>
          {summary && (
            <div className="flex items-center space-x-4 text-sm text-white/60">
              <span className="flex items-center space-x-1">
                <FileText className="h-3 w-3" />
                <span>{summary.document_count || 0} documents</span>
              </span>
              <span>•</span>
              <span>{summary.word_count || 0} words</span>
              {summary.processing_time && (
                <>
                  <span>•</span>
                  <span>{(summary.processing_time).toFixed(1)}s processing</span>
                </>
              )}
            </div>
          )}
        </div>
        
        {summary && (
          <div className="flex items-center space-x-2">
            <Button
              variant="glass"
              size="sm"
              icon={<Star className={`h-4 w-4 ${summary.is_starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />}
              onClick={handleStarToggle}
            >
              {summary.is_starred ? 'Starred' : 'Star'}
            </Button>
            <Button
              variant="glass"
              size="sm"
              icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="glass"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={handleDownload}
            >
              Download
            </Button>
            <Button
              variant="glass"
              size="sm"
              icon={<Share2 className="h-4 w-4" />}
              onClick={handleShare}
            >
              Share
            </Button>
          </div>
        )}
      </div>

      {/* Structured Sections (if available) */}
      {summary && (
        <div className="space-y-4 mb-6">
          {/* Executive Summary */}
          {summary.executive_summary && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-blue-400" />
                <span>Executive Summary</span>
              </h3>
              <div className="text-white leading-relaxed">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {summary.executive_summary}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Key Findings */}
          {summary.key_findings && Array.isArray(summary.key_findings) && summary.key_findings.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection('findings')}
                className="w-full flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Target className="h-5 w-5 text-green-400" />
                  <span>Key Findings ({summary.key_findings.length})</span>
                </h3>
                {expandedSections.has('findings') ? (
                  <ChevronUp className="h-5 w-5 text-white/60" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-white/60" />
                )}
              </button>
              
              {expandedSections.has('findings') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 bg-white/5 rounded-lg p-4"
                >
                  <ul className="space-y-3">
                    {summary.key_findings.map((finding, index) => (
                      <li key={index} className="flex items-start text-white">
                        <span className="text-green-400 mr-3 mt-1 font-semibold">{index + 1}.</span>
                        <span className="flex-1">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
          )}

          {/* Statistics - Improved with better formatting */}
          {summary.statistics && Array.isArray(summary.statistics) && summary.statistics.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection('statistics')}
                className="w-full flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-yellow-400" />
                  <span>Key Statistics ({summary.statistics.length})</span>
                </h3>
                {expandedSections.has('statistics') ? (
                  <ChevronUp className="h-5 w-5 text-white/60" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-white/60" />
                )}
              </button>
              
              {expandedSections.has('statistics') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 bg-white/5 rounded-lg p-4"
                >
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="px-4 py-3 text-left text-white font-semibold text-sm uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-white font-semibold text-sm uppercase tracking-wider">
                            Value
                          </th>
                          <th className="px-4 py-3 text-left text-white font-semibold text-sm uppercase tracking-wider">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {summary.statistics.slice(0, 15).map((stat, index) => (
                          <tr key={index} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-white/70 text-sm capitalize">
                              {stat.type === 'percentage' ? 'Percentage' :
                               stat.type === 'currency' ? 'Financial' :
                               stat.type === 'measurement' ? 'Metric' :
                               stat.type || 'Data'}
                            </td>
                            <td className="px-4 py-3 text-yellow-400 font-bold text-base">
                              {stat.value || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-white text-sm">
                              {stat.context || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {summary.statistics.length > 15 && (
                    <p className="text-white/60 text-sm mt-3 text-center">
                      Showing 15 of {summary.statistics.length} statistics
                    </p>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {summary.recommendations && Array.isArray(summary.recommendations) && summary.recommendations.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection('recommendations')}
                className="w-full flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Target className="h-5 w-5 text-blue-400" />
                  <span>Recommendations ({summary.recommendations.length})</span>
                </h3>
                {expandedSections.has('recommendations') ? (
                  <ChevronUp className="h-5 w-5 text-white/60" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-white/60" />
                )}
              </button>
              
              {expandedSections.has('recommendations') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 bg-white/5 rounded-lg p-4"
                >
                  <ul className="space-y-3">
                    {summary.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start text-white">
                        <span className="text-blue-400 mr-3 mt-1">→</span>
                        <span className="flex-1">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Summary */}
      <div>
        <button
          onClick={() => toggleSection('full')}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-primary-500/10 to-purple-500/10 rounded-lg hover:from-primary-500/20 hover:to-purple-500/20 transition-all border border-primary-500/20"
        >
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <FileBarChart className="h-5 w-5 text-primary-400" />
            <span>Full Business Summary</span>
          </h3>
          {expandedSections.has('full') ? (
            <ChevronUp className="h-5 w-5 text-white" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white" />
          )}
        </button>
        
        {expandedSections.has('full') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 bg-black/20 rounded-lg p-6 border border-white/10"
          >
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {processContent(summary?.full_summary || content || '')}
              </ReactMarkdown>
            </div>
            
            {isStreaming && (
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="inline-block w-2 h-5 bg-primary-400 ml-1 rounded-full"
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Citations Section */}
      {summary?.citations && Array.isArray(summary.citations) && summary.citations.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
            <Info className="h-4 w-4 text-white/60" />
            <span>Source Documents & Citations</span>
          </h3>
          <div className="bg-black/20 rounded-lg p-4">
            <div className="space-y-2">
              {summary.citations.map((citation, index) => (
                <div key={index} className="flex items-start justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                  <div className="flex items-start space-x-3">
                    <span className="text-primary-400 font-semibold">[{index + 1}]</span>
                    <div>
                      <p className="text-white font-medium">
                        {citation.title || citation.filename || 'Unknown Document'}
                      </p>
                      {citation.document_id && (
                        <p className="text-white/60 text-xs mt-1">
                          ID: {citation.document_id}
                        </p>
                      )}
                      {citation.pages_referenced && Array.isArray(citation.pages_referenced) && citation.pages_referenced.length > 0 && (
                        <p className="text-white/60 text-xs mt-1">
                          Pages referenced: {citation.pages_referenced.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSS for additional styling */}
      <style jsx global>{`
        .prose-invert h1,
        .prose-invert h2,
        .prose-invert h3,
        .prose-invert h4,
        .prose-invert h5,
        .prose-invert h6 {
          color: white;
        }
        
        .prose-invert p,
        .prose-invert li,
        .prose-invert td,
        .prose-invert th {
          color: white;
        }
        
        sup {
          color: rgb(147 197 253);
          font-size: 0.75rem;
        }
        
        cite {
          color: rgba(255, 255, 255, 0.7);
          font-style: italic;
        }
      `}</style>
    </GlassCard>
  );
};