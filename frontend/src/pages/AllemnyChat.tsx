/**
 * Allemny Chat - Conversational AI with Document Retrieval
 * Real-time chat interface with streaming responses and citations
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Send,
  Trash2,
  FileText,
  Clock,
  Loader2,
  Bot,
  User,
  ExternalLink,
  AlertCircle,
  Database,
  Sparkles,
  MessageSquare,
  Plus
} from 'lucide-react';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import {
  chatService,
  ChatMessage,
  Conversation,
  Citation,
  ChatStreamEvent
} from '@/services/chatService';
import toast from 'react-hot-toast';

export const AllemnyChat: React.FC = () => {
  const { user } = useAuthStore();

  // State management
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize chat
  useEffect(() => {
    initializeChat();
    return () => {
      // Cleanup any ongoing streams
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const initializeChat = async () => {
    try {
      setIsLoading(true);

      // Check if user has access to chat
      const accessGranted = await chatService.hasAccess();
      if (!accessGranted) {
        setHasAccess(false);
        return;
      }

      // Load conversations
      const convs = await chatService.getConversations();
      setConversations(convs);

      // Load most recent conversation if exists
      if (convs.length > 0) {
        await loadConversation(convs[0].id);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('administrators')) {
        setHasAccess(false);
      } else {
        toast.error('Failed to initialize chat');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const history = await chatService.getConversationHistory(conversationId);
      setCurrentConversation(conversationId);
      setMessages(history.messages);
      setStreamingMessage('');
      setCurrentCitations([]);
    } catch (error) {
      toast.error('Failed to load conversation');
    }
  };

  const createNewConversation = async () => {
    try {
      const title = inputMessage.length > 0
        ? chatService.generateTitle(inputMessage)
        : 'New Chat';

      const newConv = await chatService.createConversation(title);
      setConversations(prev => [newConv, ...prev]);
      setCurrentConversation(newConv.id);
      setMessages([]);
      setStreamingMessage('');
      setCurrentCitations([]);
    } catch (error) {
      toast.error('Failed to create new conversation');
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await chatService.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));

      if (currentConversation === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
        setStreamingMessage('');
        setCurrentCitations([]);
      }

      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    try {
      setIsStreaming(true);
      setStatusMessage('');
      setStreamingMessage('');

      let conversationId = currentConversation;

      // Create new conversation if none exists
      if (!conversationId) {
        await createNewConversation();
        conversationId = currentConversation;
      }

      // Add user message to UI
      const newUserMessage: ChatMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, newUserMessage]);

      // Start streaming response
      const stream = chatService.sendMessage(userMessage, conversationId);
      let assistantContent = '';
      let citations: Citation[] = [];
      let finalConversationId = conversationId;

      for await (const event of stream) {
        switch (event.type) {
          case 'init':
            if (event.conversation_id) {
              finalConversationId = event.conversation_id;
              setCurrentConversation(event.conversation_id);
            }
            break;

          case 'status':
            setStatusMessage(event.message || '');
            break;

          case 'content':
            assistantContent += event.content || '';
            setStreamingMessage(assistantContent);
            break;

          case 'citations':
            if (event.citations) {
              citations = event.citations;
              setCurrentCitations(citations);
            }
            break;

          case 'done':
            // Add final assistant message
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              citations
            };
            setMessages(prev => [...prev, assistantMessage]);
            setStreamingMessage('');
            setStatusMessage('');
            setCurrentCitations([]);

            // Update conversation in list
            if (finalConversationId) {
              setConversations(prev => prev.map(c =>
                c.id === finalConversationId
                  ? { ...c, total_messages: c.total_messages + 2, updated_at: new Date().toISOString() }
                  : c
              ));
            }
            break;

          case 'error':
            setStreamingMessage('');
            setStatusMessage('');
            toast.error(event.message || 'Failed to get response');
            break;
        }
      }

    } catch (error) {
      toast.error('Failed to send message');
      setStreamingMessage('');
      setStatusMessage('');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Access denied UI
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <GlassCard className="max-w-md p-8 text-center">
          <AlertCircle className="h-16 w-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
          <p className="text-slate-300 mb-4">
            Chat functionality is currently restricted to administrators.
          </p>
          <p className="text-sm text-slate-400">
            Please contact your system administrator for access.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-80 bg-black/20 backdrop-blur-sm border-r border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Bot className="h-6 w-6 text-primary-400" />
                  Allemny Chat
                </h1>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ×
                </Button>
              </div>

              <Button
                onClick={createNewConversation}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white"
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="text-sm">Start a new chat to begin</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 group ${
                        currentConversation === conv.id
                          ? 'bg-primary-600/20 border border-primary-500/50'
                          : 'bg-white/5 hover:bg-white/10 border border-transparent'
                      }`}
                      onClick={() => loadConversation(conv.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium text-sm truncate">
                            {conv.title}
                          </h3>
                          <p className="text-slate-400 text-xs mt-1">
                            {conv.total_messages} messages • {formatTimestamp(conv.updated_at)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="text-slate-400 hover:text-white mr-3"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-400" />
                <span className="text-white font-medium">AI Assistant</span>
              </div>
              <div className="text-sm text-slate-400">
                Powered by Groq & pgvector
              </div>
            </div>
            {user && (
              <div className="text-sm text-slate-400">
                {user.full_name || user.username}
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streamingMessage && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Bot className="h-16 w-16 text-primary-400 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  Welcome to Allemny Chat
                </h3>
                <p className="text-slate-400 max-w-md">
                  Ask me anything about your documents. I can search through your knowledge base
                  and provide detailed answers with citations.
                </p>
              </div>
            </div>
          )}

          {/* Render Messages */}
          <AnimatePresence>
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                isOwn={message.role === 'user'}
              />
            ))}
          </AnimatePresence>

          {/* Streaming Message */}
          {(streamingMessage || statusMessage) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <MessageBubble
                message={{
                  role: 'assistant',
                  content: streamingMessage,
                  timestamp: new Date().toISOString(),
                  citations: currentCitations
                }}
                isOwn={false}
                isStreaming={true}
                statusMessage={statusMessage}
              />
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about your documents..."
                className="w-full resize-none bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent backdrop-blur-sm"
                rows={Math.min(Math.max(inputMessage.split('\n').length, 1), 4)}
                disabled={isStreaming}
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isStreaming}
              className="bg-primary-600 hover:bg-primary-700 text-white p-3"
            >
              {isStreaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Message Bubble Component
interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isStreaming?: boolean;
  statusMessage?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isStreaming = false,
  statusMessage
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      {!isOwn && (
        <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={`max-w-3xl ${isOwn ? 'text-right' : 'text-left'}`}>
        <div
          className={`inline-block p-4 rounded-lg ${
            isOwn
              ? 'bg-primary-600 text-white'
              : 'bg-white/10 text-white border border-white/20 backdrop-blur-sm'
          }`}
        >
          {statusMessage && (
            <div className="text-primary-300 text-sm mb-2 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusMessage}
            </div>
          )}

          <div className="whitespace-pre-wrap">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-2 h-5 bg-primary-400 animate-pulse ml-1" />
            )}
          </div>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-3 w-3 text-primary-300" />
                <span className="text-xs text-primary-300 font-medium">Sources:</span>
              </div>
              <div className="space-y-1">
                {message.citations.map((citation, index) => (
                  <div
                    key={index}
                    className="text-xs text-slate-300 bg-black/20 rounded p-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      <span className="font-medium">{citation.filename}</span>
                      {citation.page_number && (
                        <span className="text-slate-400">
                          (Page {citation.page_number})
                        </span>
                      )}
                      {citation.main_tag && (
                        <span className="bg-primary-600/30 text-primary-300 px-1 rounded text-xs">
                          {citation.main_tag}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400">
                      {Math.round(citation.similarity * 100)}% match
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`text-xs text-slate-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
          <Clock className="h-3 w-3 inline mr-1" />
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {isOwn && (
        <div className="flex-shrink-0 w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </motion.div>
  );
};