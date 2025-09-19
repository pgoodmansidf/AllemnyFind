// src/components/DocumentComments.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Heart,
  Edit3,
  Trash2,
  Send,
  X,
  User,
  Clock,
  Plus,
  Loader2
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useCommentsStore } from '@/store/commentsStore';
import { useAuthStore } from '@/store/authStore';
import { DocumentComment } from '@/services/commentsApi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface DocumentCommentsProps {
  documentId: string;
  documentName: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export const DocumentComments: React.FC<DocumentCommentsProps> = ({
  documentId,
  documentName,
  isOpen,
  onClose,
  className = ''
}) => {
  const { user } = useAuthStore();
  const {
    comments,
    commentCounts,
    loading,
    error,
    fetchDocumentComments,
    createComment,
    updateComment,
    deleteComment,
    likeComment,
    unlikeComment,
    clearError
  } = useCommentsStore();

  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const documentComments = comments[documentId] || [];
  const isLoading = loading[documentId] || false;
  const commentCount = commentCounts[documentId] || 0;

  useEffect(() => {
    if (isOpen && documentId) {
      fetchDocumentComments(documentId);
    }
  }, [isOpen, documentId, fetchDocumentComments]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleCreateComment = async () => {
    if (!newCommentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await createComment(documentId, newCommentText.trim());
      if (success) {
        setNewCommentText('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editingText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateComment(commentId, editingText.trim());
      setEditingCommentId(null);
      setEditingText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (isSubmitting) return;

    if (window.confirm('Are you sure you want to delete this comment?')) {
      setIsSubmitting(true);
      try {
        await deleteComment(commentId, documentId);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleLikeToggle = async (comment: DocumentComment) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (comment.is_liked_by_user) {
        await unlikeComment(comment.id, documentId);
      } else {
        await likeComment(comment.id, documentId);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (comment: DocumentComment) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.text);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`w-full max-w-2xl max-h-[80vh] ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard className="p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Comments</h3>
                  <p className="text-white/60 text-sm truncate max-w-xs" title={documentName}>
                    {documentName}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-white/60 text-sm">
                  {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                </span>
                <Button
                  variant="glass"
                  size="sm"
                  icon={<X className="h-4 w-4" />}
                  onClick={onClose}
                />
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* New Comment Input */}
            <div className="mb-6">
              <div className="flex space-x-3">
                <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-400" />
                </div>
                <div className="flex-1 space-y-3">
                  <textarea
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-primary-400 resize-none"
                    rows={3}
                    disabled={isSubmitting}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      onClick={handleCreateComment}
                      disabled={!newCommentText.trim() || isSubmitting}
                    >
                      {isSubmitting ? 'Posting...' : 'Post Comment'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
                  <span className="ml-2 text-white/60">Loading comments...</span>
                </div>
              ) : documentComments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-white/30 mx-auto mb-3" />
                  <p className="text-white/60">No comments yet</p>
                  <p className="text-white/40 text-sm">Be the first to share your thoughts!</p>
                </div>
              ) : (
                documentComments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="flex space-x-3">
                      <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Comment Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-white">
                              {comment.user_name}
                            </span>
                            <span className="text-white/60 text-xs flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                            </span>
                            {comment.updated_at !== comment.created_at && (
                              <span className="text-white/40 text-xs">(edited)</span>
                            )}
                          </div>
                          {user?.id === comment.user_id && (
                            <div className="flex items-center space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Edit3 className="h-3 w-3" />}
                                onClick={() => startEditing(comment)}
                                disabled={isSubmitting}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Trash2 className="h-3 w-3" />}
                                onClick={() => handleDeleteComment(comment.id)}
                                disabled={isSubmitting}
                                className="text-red-400 hover:text-red-300"
                              />
                            </div>
                          )}
                        </div>

                        {/* Comment Content */}
                        {editingCommentId === comment.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-primary-400 resize-none"
                              rows={3}
                              disabled={isSubmitting}
                            />
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelEditing}
                                disabled={isSubmitting}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                icon={isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                onClick={() => handleUpdateComment(comment.id)}
                                disabled={!editingText.trim() || isSubmitting}
                              >
                                Update
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-white/90 mb-3 whitespace-pre-wrap">
                              {comment.text}
                            </p>
                            
                            {/* Like Button */}
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={
                                  <Heart 
                                    className={`h-4 w-4 ${
                                      comment.is_liked_by_user 
                                        ? 'fill-red-500 text-red-500' 
                                        : 'text-white/60 hover:text-red-500'
                                    }`} 
                                  />
                                }
                                onClick={() => handleLikeToggle(comment)}
                                disabled={isSubmitting}
                                className={`${
                                  comment.is_liked_by_user 
                                    ? 'text-red-500 hover:text-red-400' 
                                    : 'text-white/60 hover:text-red-500'
                                }`}
                              >
                                {comment.like_count > 0 && (
                                  <span className="ml-1 text-sm">
                                    {comment.like_count}
                                  </span>
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};