'use client';

import { useState } from 'react';
import type { Comment } from '@/types/comment';

interface CommentThreadProps {
  questionId: string;
  questionTitle: string;
  comments: Comment[];
  currentUser: string;
  onAddComment: (questionId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

function CommentThread({
  questionId,
  questionTitle,
  comments,
  currentUser,
  onAddComment,
  onDeleteComment,
}: CommentThreadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questionComments = comments.filter(c => c.questionId === questionId);

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

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relative inline-block">
      {/* Icône de commentaire */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-md transition-all text-sm"
        title="Commentaires"
      >
        <span>💬</span>
        {questionComments.length > 0 && (
          <span className="font-semibold">{questionComments.length}</span>
        )}
      </button>

      {/* Popup de commentaires */}
      {isOpen && (
        <>
          {/* Overlay transparent pour fermer */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Carte de commentaires */}
          <div className="absolute right-0 top-10 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
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

            {/* Liste des commentaires */}
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
        </>
      )}
    </div>
  );
}

export default CommentThread;