import { existsSync, readFileSync, readdirSync } from 'fs';
import { basename, join } from 'path';
import type { QuestionnaireInfo } from '@/types';

export const QUESTIONNAIRES_DIR = join(process.cwd(), 'data/questionnaires');

// Kept so existing installations that only have data/survey-template.json keep
// working after the introduction of the questionnaires folder.
const LEGACY_TEMPLATE_FILE = join(process.cwd(), 'data/survey-template.json');
export const LEGACY_QUESTIONNAIRE_ID = 'survey-template.json';
const DEFAULT_QUESTIONNAIRE = 'fr.json';

const LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
};

function isJsonFile(name: string): boolean {
  return (
    !name.startsWith('.') &&
    name.toLowerCase().endsWith('.json') &&
    basename(name) === name
  );
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function questionnaireInfo(
  id: string,
  json: unknown,
  language: string,
  label?: string
): QuestionnaireInfo {
  const title =
    typeof (json as { title?: unknown })?.title === 'string' &&
    (json as { title: string }).title.trim()
      ? (json as { title: string }).title.trim()
      : id;
  const languageLabel = label ?? LANGUAGE_LABELS[language] ?? language;

  return { id, name: `${languageLabel} — ${title}`, language };
}

function legacyQuestionnaireInfo(): QuestionnaireInfo | null {
  if (!existsSync(LEGACY_TEMPLATE_FILE)) return null;

  try {
    return questionnaireInfo(
      LEGACY_QUESTIONNAIRE_ID,
      readJson(LEGACY_TEMPLATE_FILE),
      'fr',
      'Questionnaire historique'
    );
  } catch {
    return null;
  }
}

/**
 * A questionnaire id is a plain file name inside data/questionnaires.
 * `survey-template.json` is also accepted: it is the pre-update questionnaire
 * still stored at the root of data/.
 */
export function isQuestionnaireId(id: unknown): id is string {
  if (typeof id !== 'string' || !isJsonFile(id)) return false;

  if (existsSync(join(QUESTIONNAIRES_DIR, id))) return true;

  return (
    id === LEGACY_QUESTIONNAIRE_ID && existsSync(LEGACY_TEMPLATE_FILE)
  );
}

/**
 * Available questionnaires, for the admin selection.
 *
 * The legacy data/survey-template.json is listed too, so installations whose
 * data volume predates the questionnaires folder can still create instances
 * without changing their existing files.
 */
export function listQuestionnaires(): QuestionnaireInfo[] {
  const questionnaires = new Map<string, QuestionnaireInfo>();

  try {
    if (existsSync(QUESTIONNAIRES_DIR)) {
      for (const id of readdirSync(QUESTIONNAIRES_DIR).filter(isJsonFile)) {
        try {
          const language = id.replace(/\.json$/i, '');
          questionnaires.set(
            id,
            questionnaireInfo(
              id,
              readJson(join(QUESTIONNAIRES_DIR, id)),
              language
            )
          );
        } catch {
          // Ignore malformed JSON files: they cannot be used as questionnaires.
        }
      }
    }
  } catch {
    // Fall back to the legacy questionnaire below.
  }

  const legacy = legacyQuestionnaireInfo();
  if (legacy && !questionnaires.has(LEGACY_QUESTIONNAIRE_ID)) {
    questionnaires.set(LEGACY_QUESTIONNAIRE_ID, legacy);
  }

  const rank = (id: string) => {
    if (id === DEFAULT_QUESTIONNAIRE) return 0;
    if (id === LEGACY_QUESTIONNAIRE_ID) return 2;
    return 1;
  };

  return [...questionnaires.values()].sort((a, b) => {
    const rankDiff = rank(a.id) - rank(b.id);
    return rankDiff !== 0 ? rankDiff : a.id.localeCompare(b.id);
  });
}

/**
 * Load a questionnaire JSON.
 *
 * - An explicit, valid selection loads that file.
 * - An instance created before the questionnaires folder (no `questionnaire`
 *   field, or a file that no longer exists) keeps using
 *   `data/survey-template.json`, exactly as it did before the update.
 * - Only when that legacy file is absent do we fall back to `fr.json`.
 */
export function loadQuestionnaireJson(id?: string): unknown {
  try {
    if (isQuestionnaireId(id)) {
      // The legacy id can also be shadowed by a file with the same name in
      // data/questionnaires/: the folder always wins.
      if (
        id === LEGACY_QUESTIONNAIRE_ID &&
        !existsSync(join(QUESTIONNAIRES_DIR, id))
      ) {
        return readJson(LEGACY_TEMPLATE_FILE);
      }

      return readJson(join(QUESTIONNAIRES_DIR, id));
    }

    if (existsSync(LEGACY_TEMPLATE_FILE)) {
      return readJson(LEGACY_TEMPLATE_FILE);
    }

    if (isQuestionnaireId(DEFAULT_QUESTIONNAIRE)) {
      return readJson(join(QUESTIONNAIRES_DIR, DEFAULT_QUESTIONNAIRE));
    }
  } catch {
    // Fall through to an empty questionnaire below.
  }

  return {};
}
