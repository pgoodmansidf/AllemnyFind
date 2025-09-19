// src/store/commentsStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { commentsApi, DocumentComment, CommentsResponse } from '@/services/commentsApi';
import toast from 'react-hot-toast';

interface CommentsState {
  comments: Record<string, DocumentComment[]>; // document_id -> comments
  commentCounts: Record<string, number>; // document_id -> total count
  loading: Record<string, boolean>; // document_id -> loading state
  error: string | null;

  // Actions
  fetchDocumentComments: (documentId: string, limit?: number, offset?: number) => Promise<void>;
  createComment: (documentId: string, text: string) => Promise<DocumentComment | null>;
  updateComment: (commentId: string, text: string) => Promise<void>;
  deleteComment: (commentId: string, documentId: string) => Promise<void>;
  likeComment: (commentId: string, documentId: string) => Promise<void>;
  unlikeComment: (commentId: string, documentId: string) => Promise<void>;
  clearComments: (documentId: string) => void;
  clearError: () => void;
}

export const useCommentsStore = create<CommentsState>()(
  devtools(
    (set, get) => ({
      comments: {},
      commentCounts: {},
      loading: {},
      error: null,

      fetchDocumentComments: async (documentId: string, limit = 50, offset = 0) => {
        try {
          set((state) => ({
            loading: { ...state.loading, [documentId]: true },
            error: null
          }));

          const response = await commentsApi.getDocumentComments(documentId, limit, offset);
          
          set((state) => ({
            comments: {
              ...state.comments,
              [documentId]: offset === 0 ? response.comments : [
                ...(state.comments[documentId] || []),
                ...response.comments
              ]
            },
            commentCounts: {
              ...state.commentCounts,
              [documentId]: response.total_count
            },
            loading: { ...state.loading, [documentId]: false }
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comments';
          set((state) => ({
            error: errorMessage,
            loading: { ...state.loading, [documentId]: false }
          }));
          toast.error(errorMessage);
        }
      },

      createComment: async (documentId: string, text: string): Promise<DocumentComment | null> => {
        try {
          set({ error: null });

          const newComment = await commentsApi.createComment({
            document_id: documentId,
            text
          });

          set((state) => ({
            comments: {
              ...state.comments,
              [documentId]: [newComment, ...(state.comments[documentId] || [])]
            },
            commentCounts: {
              ...state.commentCounts,
              [documentId]: (state.commentCounts[documentId] || 0) + 1
            }
          }));

          toast.success('Comment added successfully');
          return newComment;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create comment';
          set({ error: errorMessage });
          toast.error(errorMessage);
          return null;
        }
      },

      updateComment: async (commentId: string, text: string) => {
        try {
          set({ error: null });

          const updatedComment = await commentsApi.updateComment(commentId, { text });

          set((state) => {
            const updatedComments = { ...state.comments };
            Object.keys(updatedComments).forEach(documentId => {
              updatedComments[documentId] = updatedComments[documentId].map(comment =>
                comment.id === commentId ? updatedComment : comment
              );
            });
            return { comments: updatedComments };
          });

          toast.success('Comment updated successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update comment';
          set({ error: errorMessage });
          toast.error(errorMessage);
        }
      },

      deleteComment: async (commentId: string, documentId: string) => {
        try {
          set({ error: null });

          await commentsApi.deleteComment(commentId);

          set((state) => ({
            comments: {
              ...state.comments,
              [documentId]: (state.comments[documentId] || []).filter(
                comment => comment.id !== commentId
              )
            },
            commentCounts: {
              ...state.commentCounts,
              [documentId]: Math.max(0, (state.commentCounts[documentId] || 0) - 1)
            }
          }));

          toast.success('Comment deleted successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete comment';
          set({ error: errorMessage });
          toast.error(errorMessage);
        }
      },

      likeComment: async (commentId: string, documentId: string) => {
        try {
          set({ error: null });

          await commentsApi.likeComment(commentId);

          set((state) => ({
            comments: {
              ...state.comments,
              [documentId]: (state.comments[documentId] || []).map(comment =>
                comment.id === commentId
                  ? {
                      ...comment,
                      like_count: comment.like_count + 1,
                      is_liked_by_user: true
                    }
                  : comment
              )
            }
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to like comment';
          set({ error: errorMessage });
          toast.error(errorMessage);
        }
      },

      unlikeComment: async (commentId: string, documentId: string) => {
        try {
          set({ error: null });

          await commentsApi.unlikeComment(commentId);

          set((state) => ({
            comments: {
              ...state.comments,
              [documentId]: (state.comments[documentId] || []).map(comment =>
                comment.id === commentId
                  ? {
                      ...comment,
                      like_count: Math.max(0, comment.like_count - 1),
                      is_liked_by_user: false
                    }
                  : comment
              )
            }
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to unlike comment';
          set({ error: errorMessage });
          toast.error(errorMessage);
        }
      },

      clearComments: (documentId: string) => {
        set((state) => {
          const newComments = { ...state.comments };
          const newCounts = { ...state.commentCounts };
          const newLoading = { ...state.loading };
          
          delete newComments[documentId];
          delete newCounts[documentId];
          delete newLoading[documentId];
          
          return {
            comments: newComments,
            commentCounts: newCounts,
            loading: newLoading
          };
        });
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'comments-store'
    }
  )
);