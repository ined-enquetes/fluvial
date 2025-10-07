'use client'
import { useState, useEffect } from 'react';
import { SurveyInstance } from '@/types';

export default function AdminPage() {
  const [instances, setInstances] = useState<SurveyInstance[]>([]);
  const [token, setToken] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [adminConect, setAdminConnect] = useState(false);

  const loadInstances = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/admin/instances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        // console.log(data)
        setAdminConnect(true);
        setInstances(data.instances);
      }
    } catch (error) {
      setAdminConnect(false);
      // console.error('Erreur:', error);
    }
  };

  const createInstance = async () => {
    if (!newInstanceName || !token) return;
    
    try {
      const response = await fetch('/api/admin/instances', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newInstanceName })
      });
      
      if (response.ok) {
        setNewInstanceName('');
        loadInstances();
      }
    } catch (error) {
      // console.error('Erreur:', error);
    }
  };

  const exportJSON = async (instanceId: string, instanceName: string) => {
    try {
      const response = await fetch(`/api/survey/${instanceId}/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${instanceName}-high-part.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      // console.error('Erreur export:', error);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Administration</h1>
      {!adminConect && 
        <div className="mb-6">
          <input
            type="password"
            placeholder="Token admin"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="border p-2 mr-2"
          />
          <button onClick={loadInstances} className="bg-blue-500 text-white p-2 mr-2">
            Se connecter
          </button>
        </div>
      }

      {adminConect && 
        <div className="mb-6">
          <input
            type="text"
            placeholder="Nom de la nouvelle instance"
            value={newInstanceName}
            onChange={(e) => setNewInstanceName(e.target.value)}
            className="border p-2 mr-2"
          />
          <button onClick={createInstance} className="bg-green-500 text-white p-2 mr-2">
            Créer Instance
          </button>
        </div>
      }

      {instances.length > 0 && (
        <>
          <div className="grid gap-4">
            {instances.map((instance) => (
              <div key={instance.id} className="border p-4 rounded">
                <h3 className="font-bold">{instance.name}</h3>
                <p className="text-sm text-gray-600">ID: {instance.id}</p>
                <div className="mt-2">
                  <a
                    href={`/survey/${instance.token}`}
                    target="_blank"
                    className="bg-blue-500 text-white p-2 mr-2 inline-block"
                  >
                    Ouvrir questionnaire
                  </a>
                  <button
                    onClick={() => exportJSON(instance.id, instance.name)}
                    className="bg-purple-500 text-white p-2 mr-2"
                  >
                    Exporter JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}