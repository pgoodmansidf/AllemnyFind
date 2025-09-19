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
  EyeOff
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/store/searchStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import remarkBreaks from 'remark-breaks';
import toast from 'react-hot-toast';

interface SearchResultsProps {
  streamingContent?: string;
  isStreaming?: boolean;
  stageMessage?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  streamingContent,
  isStreaming = false,
  stageMessage = ''
}) => {
  const { searchResults, currentQuery, addComment } = useSearchStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [displayContent, setDisplayContent] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [comment, setComment] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showRawContent, setShowRawContent] = useState(false);

  // Update display content when streaming
  useEffect(() => {
    if (streamingContent) {
      setDisplayContent(streamingContent);
    } else if (searchResults?.response) {
      setDisplayContent(searchResults.response);
    }
  }, [streamingContent, searchResults]);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayContent, isStreaming]);

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

  const extractCitations = (content: string): string[] => {
    // Look for SAU references
    const sauPattern = /SAU\d+|Appl-\d+/gi;
    const citations = new Set<string>();
    let match;
    let citationIndex = 1;

    while ((match = sauPattern.exec(content)) !== null) {
      citations.add(citationIndex.toString());
      citationIndex++;
    }

    return Array.from(citations);
  };

  const parseCitationNames = (content: string): Record<string, string> => {
    const mapping: Record<string, string> = {};

    // Find the sources section
    const sourcesMatch = content.match(/Sources?:?\s*\n([\s\S]*?)$/i);
    if (sourcesMatch) {
      const sourcesContent = sourcesMatch[1].trim();
      const lines = sourcesContent.split('\n');
      let citationIndex = 1;

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && trimmed.length > 0) {
          // Remove bullet if present
          const cleanLine = trimmed.replace(/^[•\-\*]\s*/, '');
          if (cleanLine.length > 0) {
            mapping[citationIndex.toString()] = cleanLine;
            citationIndex++;
          }
        }
      });
    }

    return mapping;
  };

  const preprocessContent = (content: string): string => {
    // Clean up formatting artifacts
    let cleaned = content
      .replace(/┏━.*?━┓/g, '')
      .replace(/┗━.*?━┛/g, '')
      .replace(/┃/g, '')
      .replace(/▰+▱+/g, '')
      .replace(/Thinking\.\.\./g, '')
      .trim();

    // Split into lines
    const lines = cleaned.split('\n');
    const processedLines: string[] = [];

    let isFirstLine = true;
    let currentSection: string[] = [];
    let inNumberedList = false;
    let listCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;

      // Handle empty lines
      if (!trimmedLine) {
        if (currentSection.length > 0) {
          processedLines.push(...currentSection);
          currentSection = [];
        }
        if (processedLines.length > 0 &&
            processedLines[processedLines.length - 1] !== '') {
          processedLines.push('');
        }
        inNumberedList = false;
        listCounter = 1;
        continue;
      }

      // Handle first line as main title
      if (isFirstLine && !trimmedLine.startsWith('•') && !trimmedLine.match(/^\d+\s/)) {
        processedLines.push(`# ${trimmedLine}`);
        processedLines.push('');
        isFirstLine = false;
        continue;
      }

      // Check for Sources section
      if (trimmedLine.match(/^Sources?:?$/i)) {
        if (currentSection.length > 0) {
          processedLines.push(...currentSection);
          currentSection = [];
        }
        processedLines.push('');
        processedLines.push('## Sources');
        processedLines.push('');
        continue;
      }

      // Check for centered headers (>20 spaces)
      if (leadingSpaces > 20 && !trimmedLine.startsWith('•') && !trimmedLine.match(/^\d+\s/)) {
        if (currentSection.length > 0) {
          processedLines.push(...currentSection);
          currentSection = [];
        }
        processedLines.push('');
        processedLines.push(`## ${trimmedLine}`);
        processedLines.push('');
        inNumberedList = false;
        listCounter = 1;
        continue;
      }

      // Handle numbered lists
      const numberedMatch = trimmedLine.match(/^(\d+)\s+(.+)$/);
      if (numberedMatch) {
        if (currentSection.length > 0) {
          processedLines.push(...currentSection);
          currentSection = [];
        }
        const content = numberedMatch[2];
        processedLines.push(`${listCounter}. ${content}`);
        listCounter++;
        inNumberedList = true;
        continue;
      }

      // Handle bullet points
      if (trimmedLine.startsWith('•')) {
        if (currentSection.length > 0) {
          processedLines.push(...currentSection);
          currentSection = [];
        }

        // Extract bullet content
        let bulletContent = trimmedLine.substring(1).trim();

        // Look for continuation lines
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          const nextLeading = nextLine.match(/^(\s*)/)?.[1]?.length || 0;

          // Stop if we hit an empty line, another bullet, a header, or a numbered item
          if (!nextTrimmed ||
              nextTrimmed.startsWith('•') ||
              (nextLeading > 20 && !nextTrimmed.startsWith('•')) ||
              nextTrimmed.match(/^\d+\s/) ||
              nextTrimmed.match(/^Sources?:?$/i)) {
            break;
          }

          // If the line has enough indentation, it's a continuation
          if (nextLeading >= 2) {
            bulletContent += ' ' + nextTrimmed;
            i = j; // Skip this line in the main loop
          } else {
            break;
          }
          j++;
        }

        processedLines.push(`- ${bulletContent}`);
        inNumberedList = false;
        listCounter = 1;
        continue;
      }

      // Handle regular text
      if (!inNumberedList) {
        currentSection.push(trimmedLine);

        // Check if next line continues this paragraph
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine?.trim() || '';
        const nextLeading = nextLine?.match(/^(\s*)/)?.[1]?.length || 0;

        // If next line is empty, a header, bullet, or numbered item, flush the section
        if (!nextTrimmed ||
            (nextLeading > 20 && !nextTrimmed.startsWith('•')) ||
            nextTrimmed.startsWith('•') ||
            nextTrimmed.match(/^\d+\s/) ||
            nextTrimmed.match(/^Sources?:?$/i)) {
          processedLines.push(currentSection.join(' '));
          currentSection = [];
        }
      }
    }

    // Flush any remaining content
    if (currentSection.length > 0) {
      processedLines.push(currentSection.join(' '));
    }

    // Clean up the result
    const result = processedLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Remove excessive blank lines
      .trim();

    return result;
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
              <ul className="list-none space-y-2 mb-6 ml-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-none space-y-2 mb-6 ml-0 counter-reset-list">
                {children}
              </ol>
            ),
            li: ({ children, ordered }) => {
              if (ordered) {
                return (
                  <li className="text-white/90 flex items-start counter-increment-list">
                    <span className="text-primary-400 mr-3 mt-0.5 flex-shrink-0 font-semibold">
                      {/* Counter will be handled by CSS */}
                    </span>
                    <span className="flex-1 leading-relaxed">{children}</span>
                  </li>
                );
              }
              return (
                <li className="text-white/90 flex items-start">
                  <span className="text-primary-400 mr-2 mt-1 flex-shrink-0">•</span>
                  <span className="flex-1 leading-relaxed">{children}</span>
                </li>
              );
            },
            code: ({ inline, children }) => {
              if (inline) {
                return (
                  <code className="px-2 py-1 bg-primary-500/20 border border-primary-500/30 rounded text-sm text-primary-300 font-mono">
                    {children}
                  </code>
                );
              }
              return (
                <div className="relative group">
                  <code className="block p-4 bg-black/40 border border-white/10 rounded-lg text-sm text-white/90 overflow-x-auto font-mono">
                    {children}
                  </code>
                  <button
                    onClick={() => handleCopySection(String(children), 'code')}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copiedSection === 'code' ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-white/60" />
                    )}
                  </button>
                </div>
              );
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary-500/50 pl-4 italic text-white/80 my-4 bg-primary-500/10 py-2 pr-4 rounded-r-lg">
                {children}
              </blockquote>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:text-primary-300 underline decoration-primary-400/30 hover:decoration-primary-300 transition-colors"
              >
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-6 rounded-lg border border-white/20">
                <table className="min-w-full divide-y divide-white/20">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-primary-500/10">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/10">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-white/5 transition-colors">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="px-6 py-3 text-left text-white font-semibold">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-6 py-3 text-white/80">{children}</td>
            ),
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt}
                className="rounded-lg shadow-lg my-4 max-w-full h-auto"
              />
            ),
          }}
        >
          {formattedContent}
        </ReactMarkdown>
      </div>
    );
  };

  const hasContent = displayContent.length > 0;

  if (!hasContent && !isStreaming) {
    return null;
  }

  const citationCount = extractCitations(displayContent).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
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
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Debug Toggle Button */}
            <Button
              variant="glass"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              title="Toggle Debug Mode"
            >
              <Bug className="h-4 w-4" />
            </Button>
            {searchResults && !isStreaming && (
              <div className="flex items-center space-x-6 text-sm text-white/60">
                <span className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>{searchResults.processing_time}ms</span>
                </span>
                <span className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>{citationCount} sources</span>
                </span>
                {searchResults.include_online && (
                  <span className="flex items-center space-x-2 text-blue-400">
                    <Globe className="h-4 w-4" />
                    <span>Online</span>
                  </span>
                )}
              </div>
            )}
            {!isStreaming && (
              <Button
                variant="glass"
                size="sm"
                onClick={() => handleCopySection(displayContent, 'full-response')}
              >
                {copiedSection === 'full-response' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="mb-8 p-4 bg-black/40 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-yellow-400 font-semibold flex items-center">
                <Bug className="h-4 w-4 mr-2" />
                Debug Information
              </h4>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setShowRawContent(!showRawContent)}
              >
                {showRawContent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showRawContent ? 'Hide' : 'Show'} Raw
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-yellow-400">Content Length:</span>{' '}
                <span className="text-white/80">{displayContent.length} characters</span>
              </div>
              <div>
                <span className="text-yellow-400">Line Count:</span>{' '}
                <span className="text-white/80">{displayContent.split('\n').length} lines</span>
              </div>
              <div>
                <span className="text-yellow-400">Citations Found:</span>{' '}
                <span className="text-white/80">{citationCount}</span>
              </div>
              {showRawContent && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-yellow-400">Raw Content:</span>
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => handleCopySection(displayContent, 'raw-content')}
                    >
                      {copiedSection === 'raw-content' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <pre className="bg-black/60 p-3 rounded text-xs text-white/70 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {displayContent}
                  </pre>
                </div>
              )}
              <div className="mt-4">
                <span className="text-yellow-400">Preprocessed Markdown:</span>
                <pre className="bg-black/60 p-3 rounded text-xs text-white/70 overflow-x-auto max-h-64 overflow-y-auto mt-2 whitespace-pre-wrap">
                  {preprocessContent(displayContent)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Content or Loading State */}
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
            {renderContent(displayContent)}

            {/* Streaming indicator */}
            {isStreaming && hasContent && (
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="inline-block w-2 h-5 bg-primary-400 ml-1 rounded-full"
              />
            )}
          </div>
        )}

        {/* Comments Section */}
        {searchResults && !isStreaming && (
          <div className="mt-8 pt-8 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-primary-400" />
                <span>Comments & Notes</span>
              </h4>
              <Button
                variant="glass"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setShowCommentInput(!showCommentInput)}
              >
                Add Comment
              </Button>
            </div>

            <AnimatePresence>
              {showCommentInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4"
                >
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                      placeholder="Add a comment or note..."
                      className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-primary-400"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!comment.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {searchResults.comments && searchResults.comments.length > 0 && (
              <div className="space-y-2">
                {searchResults.comments.map((comment, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white/5 rounded-lg text-white/80 text-sm"
                  >
                    {comment.text}
                    <span className="text-white/40 text-xs ml-2">
                      {new Date(comment.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Citations Section */}
        {citationCount > 0 && !isStreaming && (
          <div className="mt-8 pt-8 border-t border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Link className="h-5 w-5 text-primary-400" />
                <span>Sources & References</span>
              </h4>
            </div>
            <div className="space-y-2">
              {(() => {
                const citations = extractCitations(displayContent);
                const citationNames = parseCitationNames(displayContent);
                return citations.map((citation) => (
                  <motion.div
                    key={citation}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-3 p-4 bg-white/5 rounded-lg
                             hover:bg-white/10 transition-all duration-200 group"
                  >
                    <span className="text-primary-400 font-mono text-sm font-semibold">
                      [{citation}]
                    </span>
                    <span className="text-white/80 text-sm flex-1">
                      {citationNames[citation] || 'Document reference from knowledge base'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-white/60
                                           transition-colors" />
                  </motion.div>
                ));
              })()}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Add CSS for numbered lists */}
      <style jsx global>{`
        .counter-reset-list {
          counter-reset: list-counter;
        }
        .counter-increment-list {
          counter-increment: list-counter;
        }
        .counter-increment-list > span:first-child::before {
          content: counter(list-counter) ".";
          color: rgb(147 51 234); /* primary-400 color */
          font-weight: 600;
        }
      `}</style>
    </motion.div>
  );
};