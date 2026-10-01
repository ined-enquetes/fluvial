'use client';

import { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Comment } from '@/types';

interface CommentThreadProps {
  questionId: string;
  /** Id used before entries had their own id: shared by every row of a section */
  sharedQuestionId?: string;
  questionTitle: string;
  comments: Comment[];
  currentUser: string;
  onAddComment: (questionId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

// The popup lives in a portal on <body>: sections of the form use their own
// stacking contexts and overflow, which used to cut the window off.
const POPUP_Z_INDEX = 9999;
const BACKDROP_Z_INDEX = 9998;
const VIEWPORT_MARGIN = 8;
const POPUP_GAP = 8;

function CommentThread({
  questionId,
  sharedQuestionId,
  questionTitle,
  comments,
  currentUser,
  onAddComment,
  onDeleteComment,
}: CommentThreadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const isShared = sharedQuestionId !== undefined && sharedQuestionId !== questionId;

  const questionComments = comments.filter(
    c => c.questionId === questionId || (isShared && c.questionId === sharedQuestionId)
  );
  const sharedCommentIds = new Set(
    questionComments.filter(c => c.questionId !== questionId).map(c => c.id)
  );

  const handleAddComment = async () => {
    if (!newCommentText.trim() || !currentUser) return;
    
    setIsSubmitting(true);
    try {
      await onAddComment(questionId, newCommentText.trim());
      setNewCommentText('');
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Erreur lors de l\'ajout du commentaire');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce commentaire ?')) return;
    
    try {
      await onDeleteComment(commentId);
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('Erreur lors de la suppression du commentaire');
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Anchored to the button in viewport coordinates, and kept inside the
  // viewport whatever the section it belongs to looks like.
  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const popup = popupRef.current;
    if (!button || !popup) return;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    popup.style.maxWidth = `${Math.max(viewportWidth - VIEWPORT_MARGIN * 2, 240)}px`;
    popup.style.maxHeight = `${Math.max(viewportHeight - VIEWPORT_MARGIN * 2, 120)}px`;

    const buttonRect = button.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();

    const left = Math.min(
      Math.max(buttonRect.right - width, VIEWPORT_MARGIN),
      viewportWidth - width - VIEWPORT_MARGIN
    );

    // Below the button by default, flipped above it when there is no room
    let top = buttonRect.bottom + POPUP_GAP;
    if (top + height > viewportHeight - VIEWPORT_MARGIN) {
      top = buttonRect.top - POPUP_GAP - height;
    }
    top = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      viewportHeight - height - VIEWPORT_MARGIN
    );

    setPosition(prev =>
      prev && prev.top === top && prev.left === left ? prev : { top, left }
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    updatePosition();

    // The popup is fixed positioned: follow the button on scroll/resize
    const handleViewportChange = () => updatePosition();
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen, questionComments.length, updatePosition]);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relative inline-block">
      {/* Comment Icon */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-md transition-all text-sm"
        title="Commentaires"
      >
        <span>💬</span>
        {questionComments.length > 0 && (
          <span className="font-semibold">{questionComments.length}</span>
        )}
      </button>

      {/* Comment Popup: portalled on <body> so no ancestor can clip it */}
      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: BACKDROP_Z_INDEX }}
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={popupRef}
              style={{
                position: 'fixed',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                zIndex: POPUP_Z_INDEX,
                visibility: position ? 'visible' : 'hidden',
              }}
              className="w-80 bg-white rounded-lg shadow-2xl border border-gray-200 max-h-96 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between rounded-t-lg">
                <h3 className="font-semibold text-sm">Commentaires</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:text-blue-200 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                {questionComments.length === 0 ? (
                  <p className="text-gray-500 text-center text-sm py-4">
                    Aucun commentaire
                  </p>
                ) : (
                  questionComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-medium text-sm text-gray-900">
                            {comment.author}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDate(comment.timestamp)}
                          </span>
                          {sharedCommentIds.has(comment.id) && (
                            <span
                              className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] uppercase"
                              title="Commentaire sur le champ : visible sur toutes les lignes de la section"
                            >
                              partagé
                            </span>
                          )}
                        </div>
                        {comment.author === currentUser && (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="text-red-600 hover:text-red-800 text-sm ml-2"
                            title="Supprimer"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {comment.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Formulaire d'ajout */}
              <div className="border-t p-3 bg-white rounded-b-lg">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Votre commentaire..."
                  className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleAddComment();
                    }
                  }}
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">Ctrl+↵</span>
                  <button
                    onClick={handleAddComment}
                    disabled={isSubmitting || !newCommentText.trim()}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

export default CommentThread;
