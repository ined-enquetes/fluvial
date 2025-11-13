'use client';

import { useState, useEffect } from 'react';
import { getUserNameFromCookie, setUserNameCookie } from '@/lib/cookiesUtils';

interface UserHeaderProps {
  onUserNameChange?: (name: string) => void;
}

function UserHeader({ onUserNameChange }: UserHeaderProps) {
  const [userName, setUserName] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    const name = getUserNameFromCookie();
    if (name) {
      setUserName(name);
      onUserNameChange?.(name);
    } else {
      // Si pas de nom, ouvrir l'édition automatiquement
      setIsEditing(true);
    }
  }, [onUserNameChange]);

  const handleSave = () => {
    if (tempName.trim()) {
      setUserNameCookie(tempName.trim());
      setUserName(tempName.trim());
      onUserNameChange?.(tempName.trim());
      setIsEditing(false);
      setTempName('');
    }
  };

  const handleEdit = () => {
    setTempName(userName);
    setIsEditing(true);
  };

  const handleCancel = () => {
    // Ne permettre l'annulation que si un nom existe déjà
    if (userName) {
      setIsEditing(false);
      setTempName('');
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Votre nom :</span>
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Entrez votre nom"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={!tempName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Valider
          </button>
          {userName && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👤</span>
          <span className="text-lg font-medium text-gray-900">{userName}</span>
        </div>
        <button
          onClick={handleEdit}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          title="Modifier votre nom"
        >
          <span className="text-xl">✏️</span>
          <span className="text-sm">Modifier</span>
        </button>
      </div>
    </div>
  );
}

export default UserHeader;
