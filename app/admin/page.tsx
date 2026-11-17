'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DdiExportVersion } from '@/lib/ddiXml';
import { HistoryEntry, QuestionnaireInfo, SurveyInstance } from '@/types';

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatHistoryDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const DDI_DOCS: Record<
  DdiExportVersion,
  {
    label: string;
    spec: string;
    fields?: string;
    schema: string;
    schemaLabel: string;
    elements?: string;
  }
> = {
  '2.6': {
    label: 'DDI Codebook 2.6',
    spec: 'https://ddialliance.org/ddi-codebook_v2.6',
    fields: 'https://docs.ddialliance.org/DDI-Codebook/2.6/xmlschema/index.html',
    schema:
      'https://ddialliance.org/Specification/DDI-Codebook/2.6/XMLSchema/codebook.xsd',
    schemaLabel: 'Schéma XSD',
    elements:
      'https://docs.ddialliance.org/DDI-Codebook/2.6/xmlschema/schemas/codebook_xsd/elements',
  },
  '2.5': {
    label: 'DDI Codebook 2.5',
    spec: 'https://ddialliance.org/Specification/DDI-Codebook/2.5/',
    fields: 'https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/index.html',
    schema:
      'https://ddialliance.org/Specification/DDI-Codebook/2.5/XMLSchema/codebook.xsd',
    schemaLabel: 'Schéma XSD',
    elements:
      'https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/schemas/codebook_xsd/elements',
  },
  '2.1': {
    label: 'DDI Codebook 2.1',
    spec: 'https://ddialliance.org/ddi-codebook_v2.1',
    fields: 'https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/index.html',
    schema:
      'https://ddialliance.org/Specification/DDI-Codebook/2.1/XMLSchema/Version2-1.xsd',
    schemaLabel: 'Schéma XSD',
    elements:
      'https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/schemas/codebook_xsd/elements',
  },
  '3.3': {
    label: 'DDI Lifecycle 3.3',
    spec: 'https://ddialliance.org/Specification/DDI-Lifecycle/3.3/',
    schema:
      'https://ddialliance.org/Specification/DDI-Lifecycle/3.3/XMLSchema/instance.xsd',
    schemaLabel: 'Schéma XSD',
  },
  '4.0': {
    label: 'DDI Lifecycle 4.0',
    spec: 'https://ddialliance.org/Specification/DDI-Lifecycle/4.0/',
    schema:
      'https://ddialliance.org/Specification/DDI-Lifecycle/4.0/JSONSchema/lifecycle40.schema.json',
    schemaLabel: 'Schéma JSON',
  },
};

const CODEBOOK_ELEMENT_NAMES = [
  'codeBook',
  'docDscr',
  'stdyDscr',
  'citation',
  'titlStmt',
  'IDNo',
  'stdyInfo',
  'subject',
  'keyword',
  'topcClas',
  'abstract',
  'sumDscr',
  'timePrd',
  'collDate',
  'nation',
  'geogCover',
  'anlyUnit',
  'universe',
  'dataKind',
  'method',
  'dataColl',
  'dataCollector',
  'sampProc',
  'collMode',
  'resInstru',
  'anlyInfo',
  'respRate',
  'dataAppr',
  'dataAccs',
  'setAvail',
  'othrStdyMat',
  'relMat',
  'relStdy',
  'othRefs',
  'fileDscr',
  'fileTxt',
  'fileName',
  'fileType',
  'verStmt',
];

const LIFECYCLE_ELEMENT_NAMES = [
  'DDIInstance',
  'StudyUnit',
  'DataCollection',
  'Methodology',
  'CollectionEvent',
  'Universe',
  'OtherMaterialScheme',
  'OtherMaterial',
  'Citation',
  'Coverage',
];

const DDI_ELEMENT_NAMES: Record<DdiExportVersion, string[]> = {
  '2.6': CODEBOOK_ELEMENT_NAMES,
  '2.5': CODEBOOK_ELEMENT_NAMES,
  '2.1': CODEBOOK_ELEMENT_NAMES,
  '3.3': LIFECYCLE_ELEMENT_NAMES,
  '4.0': LIFECYCLE_ELEMENT_NAMES,
};

export default function AdminPage() {
  const [instances, setInstances] = useState<SurveyInstance[]>([]);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireInfo[]>([]);
  const [token, setToken] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newQuestionnaire, setNewQuestionnaire] = useState('');
  const [adminConnect, setAdminConnect] = useState(false);
  const [ddiVersion, setDdiVersion] = useState<DdiExportVersion>('2.6');

  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editQuestionnaire, setEditQuestionnaire] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<SurveyInstance | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [historyTarget, setHistoryTarget] = useState<SurveyInstance | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyTitles, setHistoryTitles] = useState<Record<string, string>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importTarget, setImportTarget] = useState<SurveyInstance | null>(null);

  const ddiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [ddiImportTarget, setDdiImportTarget] = useState<SurveyInstance | null>(
    null
  );
  const [ddiImportResult, setDdiImportResult] = useState<{
    instanceName: string;
    message: string;
    version: string;
    fields: number;
    warnings: string[];
  } | null>(null);

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
        const availableQuestionnaires: QuestionnaireInfo[] =
          data.questionnaires ?? [];

        setAdminConnect(true);
        setInstances(data.instances ?? []);
        setQuestionnaires(availableQuestionnaires);
        setNewQuestionnaire(current =>
          availableQuestionnaires.some(item => item.id === current)
            ? current
            : availableQuestionnaires[0]?.id ?? ''
        );
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
        body: JSON.stringify({
          name: newInstanceName.trim(),
          questionnaire: newQuestionnaire || undefined,
        }),
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
    const legacyQuestionnaire = questionnaires.find(
      item => item.id === 'survey-template.json'
    );

    setEditingId(instance.id);
    setEditName(instance.name);
    setEditActive(instance.isActive);
    setEditQuestionnaire(
      instance.questionnaire ??
        legacyQuestionnaire?.id ??
        questionnaires[0]?.id ??
        ''
    );
    clearMessages();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditActive(true);
    setEditQuestionnaire('');
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
          questionnaire: editQuestionnaire || undefined,
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

  const exportDDI = async (instanceId: string, instanceName: string) => {
    clearMessages();
    setActionLoadingId(`ddi:${instanceId}`);

    try {
      const response = await fetch(
        `/api/survey/${instanceId}/export/ddi?version=${encodeURIComponent(
          ddiVersion
        )}`,
        { headers: authHeaders }
      );

      if (response.ok) {
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') ?? '';
        const fileNameMatch = /filename="([^"]+)"/.exec(disposition);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          fileNameMatch?.[1] ??
          `${instanceName}-ddi-${ddiVersion}.${
            ddiVersion === '4.0' ? 'json' : 'xml'
          }`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setNotice(`Export DDI ${ddiVersion} téléchargé.`);
      } else {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Erreur lors de l'export DDI.");
      }
    } catch {
      setError("Erreur réseau lors de l'export DDI.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const openDdiImportPicker = (instance: SurveyInstance) => {
    setDdiImportTarget(instance);
    ddiFileInputRef.current?.click();
  };

  const handleDdiImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    const instance = ddiImportTarget;

    // allow re-selecting same file later
    event.target.value = '';

    if (!file || !instance) return;

    const confirmed = window.confirm(
      `Importer « ${file.name} » dans l’instance « ${instance.name} » ?\n\n` +
        'Toutes les métadonnées existantes seront remplacées par le contenu du fichier DDI. ' +
        'Le logo de l’enquête sera conservé.'
    );

    if (!confirmed) {
      setDdiImportTarget(null);
      return;
    }

    clearMessages();
    setActionLoadingId(`ddi-import:${instance.id}`);

    try {
      const xml = await file.text();

      const response = await fetch(`/api/survey/${instance.id}/import/ddi`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/xml',
        },
        body: xml,
      });

      const payload = await response.json().catch(() => null);

      if (response.ok) {
        setDdiImportResult({
          instanceName: instance.name,
          message: payload?.message ?? 'Métadonnées DDI importées.',
          version: payload?.version ?? '',
          fields: Number(payload?.fields ?? 0),
          warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        });

        await loadInstances();
      } else {
        setError(payload?.error ?? "Erreur lors de l'import DDI.");
      }
    } catch {
      setError("Erreur réseau lors de l'import DDI.");
    } finally {
      setDdiImportTarget(null);
      setActionLoadingId(null);
    }
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

  const openHistory = async (instance: SurveyInstance) => {
    setHistoryTarget(instance);
    setHistoryEntries([]);
    setHistoryTitles({});
    setHistoryError('');
    setHistoryLoading(true);

    try {
      const response = await fetch(`/api/admin/instances/${instance.id}/history`, {
        headers: authHeaders,
      });

      if (response.ok) {
        const data = await response.json();
        setHistoryEntries(data.history ?? []);
        setHistoryTitles(data.questionTitles ?? {});
      } else if (response.status === 403) {
        setHistoryError('Token admin invalide.');
      } else {
        setHistoryError("Impossible de charger l'historique.");
      }
    } catch {
      setHistoryError("Erreur réseau lors du chargement de l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryTarget(null);
    setHistoryEntries([]);
    setHistoryTitles({});
    setHistoryError('');
  };

  const connected = adminConnect;

  const questionnaireLabel = (id?: string) => {
    if (id) return questionnaires.find(item => item.id === id)?.name ?? id;

    const legacyQuestionnaire = questionnaires.find(
      item => item.id === 'survey-template.json'
    );

    return legacyQuestionnaire
      ? `${legacyQuestionnaire.name} (par défaut)`
      : 'Questionnaire par défaut';
  };

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
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
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
              <div>
                <label className="mb-1 block text-sm font-medium text-black/75">
                  Questionnaire
                </label>
                <select
                  value={newQuestionnaire}
                  onChange={(e) => setNewQuestionnaire(e.target.value)}
                  disabled={questionnaires.length === 0}
                  className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#ff564e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {questionnaires.length === 0 && (
                    <option value="">Aucun questionnaire disponible</option>
                  )}
                  {questionnaires.map((questionnaire) => (
                    <option key={questionnaire.id} value={questionnaire.id}>
                      {questionnaire.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={createInstance}
                disabled={
                  actionLoadingId === 'create' ||
                  !newInstanceName.trim() ||
                  !newQuestionnaire
                }
                className="inline-flex items-center justify-center rounded-2xl bg-[#ff564e] px-5 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoadingId === 'create' ? 'Création…' : 'Créer une instance'}
              </button>
            </div>
          </section>
        )}

        {connected && (
          <section className="mb-8 rounded-[24px] border border-[#eee] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Export DDI
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
                  Le fichier est généré à la demande depuis les métadonnées
                  de l’instance, sans modifier les données JSON existantes.
                  DDI Codebook produit du XML ; DDI Lifecycle 4.0 produit du
                  JSON.
                </p>
              </div>

              <div className="lg:w-64">
                <label className="mb-1 block text-sm font-medium text-black/75">
                  Version DDI
                </label>
                <select
                  value={ddiVersion}
                  onChange={(e) =>
                    setDdiVersion(e.target.value as DdiExportVersion)
                  }
                  className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#ff564e]"
                >
                  <option value="2.6">DDI Codebook 2.6</option>
                  <option value="2.5">DDI Codebook 2.5</option>
                  <option value="2.1">DDI Codebook 2.1</option>
                  <option value="3.3">DDI Lifecycle 3.3 (XML)</option>
                  <option value="4.0">DDI Lifecycle 4.0 (JSON)</option>
                </select>
                {ddiVersion === '2.1' && (
                  <p className="mt-2 text-xs leading-5 text-black/50">
                    DDI 2.1 ne conserve qu’une seule description de fichier
                    (nom, type et version).
                  </p>
                )}
                {ddiVersion === '3.3' && (
                  <p className="mt-2 text-xs leading-5 text-black/50">
                    Export XML conforme au schéma DDI Lifecycle 3.3.
                  </p>
                )}
                {ddiVersion === '4.0' && (
                  <p className="mt-2 text-xs leading-5 text-black/50">
                    Export JSON conforme au schéma DDI Lifecycle 4.0.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <a
                href={DDI_DOCS[ddiVersion].spec}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-black underline decoration-[#ff564e]/40 underline-offset-4 transition hover:text-[#ff564e]"
              >
                Spécification {DDI_DOCS[ddiVersion].label} ↗
              </a>
              {DDI_DOCS[ddiVersion].fields && (
                <a
                  href={DDI_DOCS[ddiVersion].fields}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-black underline decoration-[#ff564e]/40 underline-offset-4 transition hover:text-[#ff564e]"
                >
                  Documentation des éléments ↗
                </a>
              )}
              <a
                href={DDI_DOCS[ddiVersion].schema}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-black underline decoration-[#ff564e]/40 underline-offset-4 transition hover:text-[#ff564e]"
              >
                {DDI_DOCS[ddiVersion].schemaLabel} ↗
              </a>
            </div>

            <details className="mt-4 rounded-2xl border border-[#eee] bg-[#fafafa] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-black/75">
                Éléments DDI utilisés (documentation officielle)
              </summary>
              <p className="mt-2 text-xs leading-5 text-black/50">
                {DDI_DOCS[ddiVersion].elements
                  ? 'Chaque lien ouvre la fiche officielle de l’élément correspondant.'
                  : 'Les éléments ci-dessous renvoient au schéma officiel de la version sélectionnée.'}
                {ddiVersion === '2.1'
                  ? ' La documentation de terrain DDI 2.5 est utilisée comme référence, car DDI 2.1 est rétrocompatible.'
                  : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DDI_ELEMENT_NAMES[ddiVersion].map((name) =>
                  DDI_DOCS[ddiVersion].elements ? (
                    <a
                      key={name}
                      href={`${DDI_DOCS[ddiVersion].elements}/${name}.html`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[#eee] bg-white px-3 py-1 font-mono text-[11px] text-black/70 transition hover:border-[#ff564e] hover:text-[#ff564e]"
                    >
                      {name}
                    </a>
                  ) : (
                    <span
                      key={name}
                      className="rounded-full border border-[#eee] bg-white px-3 py-1 font-mono text-[11px] text-black/70"
                    >
                      {name}
                    </span>
                  )
                )}
              </div>
            </details>
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
                          <div className="mt-1 text-sm text-black/55">
                            Questionnaire : {questionnaireLabel(instance.questionnaire)}
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
                          onClick={() => openHistory(instance)}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] hover:cursor-pointer"
                        >
                          Historique des modifications
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
                          onClick={() => exportDDI(instance.id, instance.name)}
                          disabled={actionLoadingId === `ddi:${instance.id}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] disabled:cursor-not-allowed disabled:opacity-50 hover:cursor-pointer"
                        >
                          {actionLoadingId === `ddi:${instance.id}`
                            ? 'Génération…'
                            : `Télécharger DDI ${ddiVersion} ▾`}
                        </button>

                        <button
                          onClick={() => openDdiImportPicker(instance)}
                          disabled={
                            actionLoadingId === `ddi-import:${instance.id}`
                          }
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e] disabled:cursor-not-allowed disabled:opacity-50 hover:cursor-pointer"
                        >
                          {actionLoadingId === `ddi-import:${instance.id}`
                            ? 'Import DDI…'
                            : 'Importer un DDI'}
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

                      <div>
                        <label className="mb-1 block text-sm font-medium text-black/75">
                          Questionnaire
                        </label>
                        <select
                          value={editQuestionnaire}
                          onChange={(e) => setEditQuestionnaire(e.target.value)}
                          disabled={questionnaires.length === 0}
                          className="w-full rounded-2xl border border-[#eee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#ff564e] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {questionnaires.length === 0 && (
                            <option value="">Aucun questionnaire disponible</option>
                          )}
                          {questionnaires.map((questionnaire) => (
                            <option key={questionnaire.id} value={questionnaire.id}>
                              {questionnaire.name}
                            </option>
                          ))}
                        </select>
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

        {ddiImportResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-black">
                Import DDI terminé
              </h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                {ddiImportResult.message} L’instance{' '}
                <span className="font-medium text-black">
                  {ddiImportResult.instanceName}
                </span>{' '}
                contient désormais {ddiImportResult.fields} champs.
              </p>

              {ddiImportResult.version && (
                <div className="mt-4 rounded-2xl border border-[#eee] bg-[#eee] px-4 py-3 text-sm text-black/70">
                  Version DDI détectée : {ddiImportResult.version}
                </div>
              )}

              {ddiImportResult.warnings.length > 0 && (
                <div className="mt-4 rounded-2xl border border-[#ff564e]/20 bg-[#ff564e]/5 px-4 py-3">
                  <div className="text-sm font-medium text-[#ff564e]">
                    {ddiImportResult.warnings.length} avertissement(s)
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-black/70">
                    {ddiImportResult.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setDdiImportResult(null)}
                  className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
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

        {historyTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-[#eee] px-6 py-5">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-black">
                    Historique des modifications
                  </h2>
                  <p className="mt-1 text-sm text-black/55">
                    {historyTarget.name}
                    {!historyLoading && !historyError && (
                      <>
                        {' · '}
                        {historyEntries.length} modification
                        {historyEntries.length > 1 ? 's' : ''}
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={closeHistory}
                  className="rounded-2xl border border-[#eee] bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-[#ff564e] hover:text-[#ff564e]"
                >
                  Fermer
                </button>
              </div>

              <div className="overflow-y-auto px-6 py-5">
                {historyLoading && (
                  <p className="text-sm text-black/55">Chargement de l’historique…</p>
                )}

                {historyError && (
                  <p className="text-sm text-[#ff564e]">{historyError}</p>
                )}

                {!historyLoading && !historyError && historyEntries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#eee] px-4 py-10 text-center text-sm text-black/55">
                    Aucune modification enregistrée pour le moment.
                  </div>
                )}

                {!historyLoading && !historyError && historyEntries.length > 0 && (
                  <ol className="space-y-3">
                    {historyEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-2xl border border-[#eee] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-black">
                            {formatHistoryDate(entry.updatedAt ?? entry.timestamp)}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full bg-[#eee] px-2.5 py-1 font-medium text-black">
                              {entry.author}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 font-medium ${
                                entry.source === 'import'
                                  ? 'bg-black text-white'
                                  : 'bg-[#ff564e]/10 text-[#ff564e]'
                              }`}
                            >
                              {entry.source === 'import' ? 'Import' : 'Questionnaire'}
                            </span>
                          </div>
                        </div>

                        <ul className="mt-3 space-y-2 text-sm">
                          {entry.changes.map((change) => {
                            const title = historyTitles[change.field];

                            return (
                              <li key={change.field} className="break-words">
                                <span className="font-medium text-black">
                                  {title || change.field}
                                </span>
                                {title && (
                                  <span className="ml-1 text-xs text-black/40">
                                    {change.field}
                                  </span>
                                )}
                                <span className="text-black/45"> : </span>
                                <span className="text-black/55 line-through">
                                  {formatHistoryValue(change.oldValue)}
                                </span>
                                <span className="mx-1 text-black/45">→</span>
                                <span className="font-medium text-black">
                                  {formatHistoryValue(change.newValue)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}
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
      <input
        ref={ddiFileInputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={handleDdiImportFileChange}
      />
    </main>
  );
}
