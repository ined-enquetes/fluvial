import {
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { FieldChange, HistoryEntry, HistorySource, ResponsesData } from '@/types';

const RESPONSES_DIR = join(process.cwd(), 'data/responses/');

// Consecutive edits from the same author are grouped into a single history
// entry. An entry covers at most this duration from its first change; after
// that, a new entry is started.
const HISTORY_MERGE_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_AUTHOR = 'Anonyme';

interface SaveMeta {
  author?: string;
  source?: HistorySource;
}

function ensureDataDirectory(folder: string) {
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
}

function getQuestionnaireFolder(token: string): string {
  return join(RESPONSES_DIR, token);
}

function getHistoryFolder(token: string): string {
  return join(getQuestionnaireFolder(token), 'history');
}

function historyFileName(entry: HistoryEntry): string {
  return `${entry.timestamp.replace(/[:.]/g, '-')}_${entry.id}.json`;
}

function findHistoryFile(token: string, entryId: string): string | null {
  const folder = getHistoryFolder(token);

  try {
    const name = readdirSync(folder).find(fileName =>
      fileName.endsWith(`_${entryId}.json`)
    );

    return name ? join(folder, name) : null;
  } catch {
    return null;
  }
}

function readResponsesFile(file: string): Record<string, unknown> {
  try {
    if (!existsSync(file)) return {};
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);

    if (aIsArray !== bIsArray) return false;

    if (aIsArray && bIsArray) {
      if (a.length !== b.length) return false;
      return a.every((value, index) => deepEqual(value, b[index]));
    }

    const aObject = a as Record<string, unknown>;
    const bObject = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObject), ...Object.keys(bObject)]);

    for (const key of keys) {
      if (!deepEqual(aObject[key], bObject[key])) return false;
    }

    return true;
  }

  return false;
}

function diffResponses(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): FieldChange[] {
  const fields = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes: FieldChange[] = [];

  for (const field of fields) {
    const oldValue = previous[field] ?? null;
    const newValue = next[field] ?? null;

    if (!deepEqual(oldValue, newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }

  return changes;
}

function mergeChanges(existing: FieldChange[], incoming: FieldChange[]): FieldChange[] {
  const byField = new Map(existing.map(change => [change.field, change]));

  for (const change of incoming) {
    const previous = byField.get(change.field);

    if (previous) {
      // Keep the first old value (start of the editing session) and the latest
      // new value.
      previous.newValue = change.newValue;
    } else {
      byField.set(change.field, { ...change });
    }
  }

  // Drop fields that were changed then changed back during the same session.
  return [...byField.values()].filter(change => !deepEqual(change.oldValue, change.newValue));
}

export function loadHistory(token: string): HistoryEntry[] {
  const folder = getHistoryFolder(token);

  try {
    if (!existsSync(folder)) return [];

    return readdirSync(folder)
      .filter(name => name.endsWith('.json'))
      .map(name => {
        try {
          return JSON.parse(readFileSync(join(folder, name), 'utf8')) as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is HistoryEntry => entry !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (error) {
    console.error('Loading history error:', error);
    return [];
  }
}

function recordHistory(
  token: string,
  changes: FieldChange[],
  meta: Required<SaveMeta>
): HistoryEntry | null {
  if (changes.length === 0) return null;

  const folder = getHistoryFolder(token);
  ensureDataDirectory(folder);

  const now = new Date();
  const history = loadHistory(token);
  const last = history[history.length - 1];
  const lastFile = last ? findHistoryFile(token, last.id) : null;

  const canMerge =
    last !== undefined &&
    lastFile !== null &&
    meta.source === 'survey' &&
    last.source === 'survey' &&
    last.author === meta.author &&
    now.getTime() - new Date(last.timestamp).getTime() <= HISTORY_MERGE_WINDOW_MS;

  if (canMerge) {
    const mergedChanges = mergeChanges(last.changes, changes);

    if (mergedChanges.length === 0) {
      // Everything was reverted during this editing session: remove the entry.
      try {
        unlinkSync(lastFile);
      } catch {
        // The entry is already gone, nothing to do.
      }
      return null;
    }

    const updated: HistoryEntry = {
      ...last,
      updatedAt: now.toISOString(),
      changes: mergedChanges,
    };

    writeFileSync(lastFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  const entry: HistoryEntry = {
    id: randomUUID(),
    timestamp: now.toISOString(),
    updatedAt: now.toISOString(),
    author: meta.author,
    source: meta.source,
    changes,
  };

  writeFileSync(join(folder, historyFileName(entry)), JSON.stringify(entry, null, 2), 'utf8');
  return entry;
}

export function loadResponses(token: string): ResponsesData {
  const folder = getQuestionnaireFolder(token);
  const FILE = join(folder, 'responses.json');

  try {
    ensureDataDirectory(folder);

    if (!existsSync(FILE)) {
      const initialData: ResponsesData = {};
      writeFileSync(FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    return data;
  } catch (error) {
    console.error('Loading save error:', error);
    return {};
  }
}

export function saveResponses(
  responsesData: Record<string, unknown>,
  token: string,
  meta: SaveMeta = {}
): void {
  const folder = getQuestionnaireFolder(token);
  const FILE = join(folder, 'responses.json');

  try {
    ensureDataDirectory(folder);

    // Read the previous state before overwriting it so the history can hold
    // the field-level differences.
    const previous = readResponsesFile(FILE);
    const changes = diffResponses(previous, responsesData);

    writeFileSync(FILE, JSON.stringify(responsesData, null, 2), 'utf8');

    try {
      recordHistory(token, changes, {
        author: meta.author?.trim() || DEFAULT_AUTHOR,
        source: meta.source ?? 'survey',
      });
    } catch (error) {
      // The answers are saved: never fail the request because of the history.
      console.error('Save history error:', error);
    }

    console.log(`Save responses for ${Object.keys(responsesData).length} tokens`);
  } catch (error) {
    console.error('Save responses error:', error);
    throw error;
  }
}

export function archiveResponses(token: string): void {
  const folder = getQuestionnaireFolder(token);
  const archivesFolder = join(RESPONSES_DIR, 'archives/');

  try {
    if (!existsSync(folder)) return;

    ensureDataDirectory(archivesFolder);

    // Move the whole questionnaire folder (responses, comments and history).
    let target = join(archivesFolder, token);

    if (existsSync(target)) {
      target = join(archivesFolder, `${token}-${Date.now()}`);
    }

    renameSync(folder, target);
    console.log(`Questionnaire data archived to ${target}`);
  } catch (error) {
    console.error('Cannot archive error:', error);
    throw error;
  }
}

export function saveTokenResponse(
  token: string,
  surveyData: Record<string, unknown>,
  author?: string
): void {
  try {
    saveResponses(surveyData, token, { author, source: 'survey' });
  } catch (error) {
    console.error('Save token error:', error);
    throw error;
  }
}
