'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SurveyInstance } from '@/types';

export default function AdminPage() {
  const [instances, setInstances] = useState<SurveyInstance[]>([]);
  const [token, setToken] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [adminConnect, setAdminConnect] = useState(false);

  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<SurveyInstance | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importTarget, setImportTarget] = useState<SurveyInstance | null>(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  useEffect(() => {
    if (!notice && !error) return;

    const timer = window.setTimeout(() => {
      setNotice('');
      setError('');
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [notice, error]);

  const clearMessages = () => {
    setNotice('');
    setError('');
  };

  const loadInstances = async () => {
    if (!token) return;

    clearMessages();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/instances', {
        headers: authHeaders,
      });

      if (response.ok) {
        const data = await response.json();
        setAdminConnect(true);
        setInstances(data.instances ?? []);
      } else if (response.status === 403) {
        setAdminConnect(false);
        setError('Token admin invalide.');
      } else {
        setAdminConnect(false);
        setError('Impossible de charger les instances.');
      }
    } catch {
      setAdminConnect(false);
      setError('Erreur réseau lors du chargement.');
    } finally {
      setLoading(false);
    }
  };

  const createInstance = async () => {
    if (!newInstanceName.trim() || !token) return;

    clearMessages();
    setActionLoadingId('create');

    try {
      const response = await fetch('/api/admin/instances', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newInstanceName.trim() }),
      });

      if (response.ok) {
        setNewInstanceName('');
        setNotice('Instance créée.');
        await loadInstances();
      } else {
        setError("Erreur lors de la création de l'instance.");
      }
    } catch {
      setError('Erreur réseau lors de la création.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const startEdit = (instance: SurveyInstance) => {
    setEditingId(instance.id);
    setEditName(instance.name);
    setEditActive(instance.isActive);
    clearMessages();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditActive(true);
  };

  const saveEdit = async (instanceId: string) => {
    if (!editName.trim()) return;

    clearMessages();
    setActionLoadingId(instanceId);

    try {
      const response = await fetch('/api/admin/instances', {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: instanceId,
          name: editName.trim(),
          isActive: editActive,
        }),
      });

      if (response.ok) {
        setNotice('Instance mise à jour.');
        cancelEdit();
        await loadInstances();
      } else {
        setError("Erreur lors de la mise à jour de l'instance.");
      }
    } catch {
      setError('Erreur réseau lors de la mise à jour.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const exportJSON = async (instanceId: string, instanceName: string) => {
    clearMessages();

    try {
      const response = await fetch(`/api/survey/${instanceId}/export`, {
        headers: authHeaders,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${instanceName}-high-part.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setNotice('Export téléchargé.');
      } else {
        setError("Erreur lors de l'export.");
      }
    } catch {
      setError("Erreur réseau lors de l'export.");
    }
  };

  const openImportPicker = (instance: SurveyInstance) => {
    setImportTarget(instance);
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    const instance = importTarget;

    // allow re-selecting same file later
    event.target.value = '';

    if (!file || !instance) return;

    clearMessages();
    setActionLoadingId(instance.id);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const responseData = parsed?.responseData ?? parsed;

      const response = await fetch('/api/admin/instances', {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: instance.id,
          responseData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(data?.message ?? 'Questionnaire importé avec succès.')
        setNotice(
          data?.message ?? 'Questionnaire importé avec succès.'
        );

        await loadInstances();
      } else {
        setError("Erreur lors de l'import du questionnaire.");
      }
    } catch {
      setError('Le fichier JSON est invalide.');
    } finally {
      setImportTarget(null);
      setActionLoadingId(null);
    }
  };

  const handleImportDDI = (instance: SurveyInstance) => {
    setNotice(`Import DDI à venir pour « ${instance.name} ».`);
    setError('');
  };

  const openDeleteModal = (instance: SurveyInstance) => {
    setDeleteTarget(instance);
    setDeleteConfirm('');
    clearMessages();
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteConfirm('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.name.trim()) return;

    clearMessages();
    setActionLoadingId(deleteTarget.id);

    try {
      const response = await fetch('/api/admin/instances', {
        method: 'DELETE',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      if (response.ok) {
        setNotice('Instance supprimée.');
        closeDeleteModal();
        await loadInstances();
      } else {
        setError("Erreur lors de la suppression de l'instance.");
      }
    } catch {
      setError('Erreur réseau lors de la suppression.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const connected = adminConnect;

  return (
    <main
      className="min-h-screen bg-white text-black"
      style={{ fontFamily: 'Poppins, sans-serif' }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
              FLUVIAL by Ined
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Administration
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
              Créer, ouvrir, exporter, modifier et supprimer vos instances.
            </p>
          </div>

          {connected && (
            <button
              onClick={loadInstances}
              disabled={loading}
              className="rounded-2xl border border-[#eee] bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Chargement…' : 'Rafraîchir'}
            </button>
          )}
        </header>

        {!connected && (<section className="mb-6 rounded-[24px] border border-[#eee] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-5">
          
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium text-black/75">
                  Token admin
                </label>
                <input
                  type="password"
                  placeholder="Token admin"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#ff564e]"
                />
              </div>
              <button
                onClick={loadInstances}
                disabled={loading || !token}
                className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
              >
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </div>
          
        </section>)}

        {connected && (
          <section className="mb-8 rounded-[24px] border border-[#eee] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium text-black/75">
                  Nouvelle instance
                </label>
                <input
                  type="text"
                  placeholder="Nom de la nouvelle instance"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#ff564e]"
                />
              </div>
              <button
                onClick={createInstance}
                disabled={actionLoadingId === 'create' || !newInstanceName.trim()}
                className="inline-flex items-center justify-center rounded-2xl bg-[#ff564e] px-5 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoadingId === 'create' ? 'Création…' : 'Créer une instance'}
              </button>
            </div>
          </section>
        )}

        {connected && instances.length === 0 && (
          <section className="rounded-[24px] border border-dashed border-[#eee] bg-white px-6 py-10 text-center text-sm text-black/55">
            Aucune instance pour le moment.
          </section>
        )}

        {connected && instances.length > 0 && (
          <section className="grid gap-4">
            {instances.map((instance) => {
              const isEditing = editingId === instance.id;
              const isBusy = actionLoadingId === instance.id;

              return (
                <article
                  key={instance.id}
                  className="rounded-[24px] border border-[#eee] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                >
                  {!isEditing ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold tracking-tight">
                              {instance.name}
                            </h2>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                                instance.isActive
                                  ? 'bg-[#eee] text-black'
                                  : 'bg-black text-white'
                              }`}
                            >
                              {instance.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-black/55">
                            Token : {instance.token}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <a
                          href={`/survey/${instance.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                        >
                          Ouvrir le questionnaire ↗
                        </a>

                        <button
                          onClick={() => exportJSON(instance.id, instance.name)}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] hover:cursor-pointer"
                        >
                          Téléchager JSON ▾
                        </button>

                        <button
                          onClick={() => openImportPicker(instance)}
                          disabled={actionLoadingId === instance.id}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] disabled:opacity-50 hover:cursor-pointer"
                        >
                          {actionLoadingId === instance.id
                            ? 'Import...'
                            : 'Importer un questionnaire JSON'}
                        </button>

                        <button
                          onClick={() => handleImportDDI(instance)}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] hover:cursor-pointer"
                        >
                          Importer un DDI
                        </button>

                        <button
                          onClick={() => startEdit(instance)}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-[#eee] px-4 py-3 text-sm font-medium text-black transition hover:bg-[#e6e6e6] hover:cursor-pointer"
                        >
                          Modifier
                        </button>

                        <button
                          onClick={() => openDeleteModal(instance)}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#ff564e]/20 bg-[#ff564e]/10 px-4 py-3 text-sm font-medium text-[#ff564e] transition hover:bg-[#ff564e]/15  hover:cursor-pointer"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-black/75">
                          Nom
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#ff564e]"
                        />
                      </div>

                      <label className="flex items-center gap-3 text-sm text-black/75">
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                          className="h-4 w-4 rounded border-[#eee] text-[#ff564e] focus:ring-[#ff564e]"
                        />
                        Instance active
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => saveEdit(instance.id)}
                          disabled={isBusy || !editName.trim()}
                          className="inline-flex items-center justify-center rounded-2xl bg-[#ff564e] px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e]"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-black">
                Supprimer l’instance
              </h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Cette action est irréversible. Tapez exactement le nom de l’instance pour confirmer.
              </p>

              <div className="mt-4 rounded-2xl border border-[#eee] bg-[#eee] px-4 py-3">
                <div className="text-sm font-medium text-black">{deleteTarget.name}</div>
                <div className="mt-1 text-xs text-black/55">ID : {deleteTarget.id}</div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-black/75">
                  Tapez le nom de l’instance
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#ff564e]"
                  placeholder={deleteTarget.name}
                />
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  onClick={closeDeleteModal}
                  className="rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e]"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={
                    actionLoadingId === deleteTarget.id ||
                    deleteConfirm.trim() !== deleteTarget.name.trim()
                  }
                  className="rounded-2xl bg-[#ff564e] px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoadingId === deleteTarget.id ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {(notice || error) && (
          <div className="fixed bottom-6 right-6 z-[100]">
            {notice && (
              <div className="mb-2 min-w-[260px] rounded-2xl border border-[#eee] bg-white px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <p className="text-sm font-medium text-black">{notice}</p>
              </div>
            )}

            {error && (
              <div className="min-w-[260px] rounded-2xl border border-[#ff564e]/20 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <p className="text-sm font-medium text-[#ff564e]">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </main>
  );
}
