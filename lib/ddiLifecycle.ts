/**
 * Shared DDI Lifecycle study model.
 *
 * DDI Lifecycle 3.3 (XML) and 4.0 (JSON) describe the same information with
 * very different structures. This module normalises the flat SurveyJS
 * response object once, reading every source key from the parametric mapping
 * file, so that each generator only has to serialise a typed model.
 */

import {
  asList,
  cleanText,
  firstString,
  isRecord,
  recordList,
  valueList,
} from './ddiXml';
import {
  DDI_LIFECYCLE_MAPPING,
  lifecycleItemFields,
  lifecycleLabel,
  lifecycleListSeparators,
  lifecycleSources,
} from './ddiLifecycleMapping';

export interface LifecyclePerson {
  name: string;
  affiliation?: string;
  role?: string;
  abbr?: string;
}

export interface LifecycleDistributor extends LifecyclePerson {
  abbr?: string;
  uri?: string;
  localId?: string;
}

export interface LifecycleFunder {
  name: string;
  role?: string;
  grant?: string;
}

export interface LifecycleKeyword {
  value: string;
  vocabularyUri?: string;
}

export interface LifecycleDateRange {
  simple?: string;
  start?: string;
  end?: string;
  cycle?: string;
}

export interface LifecycleVersionStatement {
  id?: string;
  change?: string;
  date?: string;
}

export interface LifecycleFile {
  name?: string;
  content?: string;
  cases?: string;
  variables?: string;
  types: string[];
  versions: LifecycleVersionStatement[];
}

export interface LifecycleMaterial {
  name: string;
  description?: string;
  url?: string;
  type: string;
}

export interface LifecycleStudy {
  id: string;
  agency: string;
  version: string;
  language: string;
  title: string;
  subtitle?: string;
  alternateTitle?: string;
  parallelTitle?: string;
  doi?: string;
  abstract?: string;
  website?: string;
  longCitation?: string;
  shortCitation?: string;
  versionDate?: string;
  publicationDate?: string;
  authors: LifecyclePerson[];
  contributors: LifecyclePerson[];
  referents: string[];
  metadataTeam: LifecyclePerson[];
  producers: LifecyclePerson[];
  distributors: LifecycleDistributor[];
  funders: LifecycleFunder[];
  dataCollectors: LifecyclePerson[];
  keywords: LifecycleKeyword[];
  inedTopics: string[];
  cessdaTopics: string[];
  countries: string[];
  geographicCoverage?: string;
  analysisUnits: string[];
  universe?: string;
  kindsOfData: string[];
  timePeriods: LifecycleDateRange[];
  collectionDates: LifecycleDateRange[];
  collectionModes: string[];
  collectionModeDetail?: string;
  instruments: string[];
  instrumentDetail?: string;
  timeMethods: string[];
  samplingProcedures: string[];
  samplingDetail?: string;
  frequency?: string;
  collectionSituation?: string;
  weighting?: string;
  cleaning?: string;
  responseRate?: string;
  dataQuality?: string;
  materials: LifecycleMaterial[];
  versionStatements: LifecycleVersionStatement[];
  files: LifecycleFile[];
}

export interface LifecycleGenerationOptions {
  fallbackTitle?: string;
  fallbackId?: string;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function rawSource(
  data: Record<string, unknown>,
  group: string,
  name: string
): unknown {
  for (const key of lifecycleSources(group, name)) {
    if (hasValue(data[key])) return data[key];
  }
  return undefined;
}

function sourceText(
  data: Record<string, unknown>,
  group: string,
  name: string
): string {
  return firstString(data, lifecycleSources(group, name));
}

function sourceStrings(
  data: Record<string, unknown>,
  group: string,
  name: string
): string[] {
  return valueList(rawSource(data, group, name));
}

function rawField(
  record: Record<string, unknown>,
  keys: string[] | undefined
): unknown {
  if (!keys) return undefined;
  for (const key of keys) {
    if (hasValue(record[key])) return record[key];
  }
  return undefined;
}

function fieldText(
  record: Record<string, unknown>,
  keys: string[] | undefined
): string {
  return keys ? firstString(record, keys) : '';
}

function splitValues(values: string[], separators: string[]): string[] {
  const result: string[] = [];

  for (const value of values) {
    let parts = [value];
    for (const separator of separators) {
      parts = parts.flatMap((part) => part.split(separator));
    }
    for (const part of parts) {
      const text = cleanText(part);
      if (text && !result.includes(text)) result.push(text);
    }
  }

  return result;
}

function personList(
  data: Record<string, unknown>,
  group: string,
  sourceGroup = 'study'
): LifecyclePerson[] {
  const fields = lifecycleItemFields(group);

  return recordList(rawSource(data, sourceGroup, group))
    .map((record) => ({
      name: fieldText(record, fields.name ?? ['name']),
      affiliation: fieldText(record, fields.affiliation ?? ['affiliation']),
      role: fieldText(record, fields.role ?? ['role']),
      abbr: fieldText(record, fields.abbr ?? ['abbr']),
    }))
    .filter((person) => person.name);
}

function distributorList(
  data: Record<string, unknown>
): LifecycleDistributor[] {
  const fields = lifecycleItemFields('distributors');

  return recordList(rawSource(data, 'study', 'distributors'))
    .map((record) => ({
      name: fieldText(record, fields.name ?? ['name']),
      abbr: fieldText(record, fields.abbr ?? ['abbr']),
      uri: fieldText(record, fields.uri ?? ['uri']),
      localId: fieldText(record, fields.id ?? ['id']),
      affiliation: fieldText(record, fields.affiliation ?? ['affiliation']),
    }))
    .filter((distributor) => distributor.name);
}

function funderList(data: Record<string, unknown>): LifecycleFunder[] {
  const fields = lifecycleItemFields('funders');

  return recordList(rawSource(data, 'study', 'funders'))
    .map((record) => ({
      name: fieldText(record, fields.name ?? ['name']),
      role: fieldText(record, fields.role ?? ['role']),
      grant: fieldText(record, fields.grant ?? ['grant']),
    }))
    .filter((funder) => funder.name);
}

function keywordList(data: Record<string, unknown>): LifecycleKeyword[] {
  const fields = lifecycleItemFields('keywords');
  const keywords: LifecycleKeyword[] = [];

  for (const item of asList(rawSource(data, 'coverage', 'keywords'))) {
    if (isRecord(item)) {
      const value = fieldText(item, fields.name ?? ['value']);
      if (value) {
        keywords.push({
          value,
          vocabularyUri: fieldText(item, fields.uri ?? ['uri']) || undefined,
        });
      }
      continue;
    }

    const value = cleanText(item);
    if (value) keywords.push({ value });
  }

  return keywords;
}

function versionStatement(
  record: Record<string, unknown>,
  group: string
): LifecycleVersionStatement {
  const fields = lifecycleItemFields(group);

  return {
    id: fieldText(record, fields.id) || undefined,
    change: fieldText(record, fields.change) || undefined,
    date: fieldText(record, fields.date) || undefined,
  };
}

function versionStatementList(
  data: Record<string, unknown>,
  group: string,
  sourceName = group
): LifecycleVersionStatement[] {
  return recordList(rawSource(data, 'study', sourceName))
    .map((record) => versionStatement(record, group))
    .filter((statement) => statement.id || statement.change || statement.date);
}

function fileList(data: Record<string, unknown>): LifecycleFile[] {
  const fields = lifecycleItemFields('files');

  return recordList(rawSource(data, 'files', 'descriptions')).map((record) => ({
    name: fieldText(record, fields.name) || undefined,
    content: fieldText(record, fields.content) || undefined,
    cases: fieldText(record, fields.cases) || undefined,
    variables: fieldText(record, fields.variables) || undefined,
    types: valueList(rawField(record, fields.types), [
      'fileType',
      'value',
      'label',
    ]),
    versions: recordList(rawField(record, fields.versions)).map((entry) =>
      versionStatement(entry, 'fileVersionStatements')
    ),
  }));
}

function dateRanges(
  data: Record<string, unknown>,
  group: string,
  name: string
): LifecycleDateRange[] {
  const fields = lifecycleItemFields(name);
  const ranges: LifecycleDateRange[] = [];
  let pending: LifecycleDateRange | undefined;

  for (const record of recordList(rawSource(data, group, name))) {
    const simple = fieldText(record, fields.direct);
    const start = fieldText(record, fields.start);
    const end = fieldText(record, fields.end);
    const cycle = fieldText(record, fields.cycle) || undefined;
    const event = fieldText(record, fields.event).toLowerCase();

    if (simple) {
      ranges.push({ simple, cycle });
      continue;
    }

    // Stored dates may keep the value in `@start` and flag the bound in
    // `@event` ("start"/"end"). Treat that as an explicit bound.
    if (event === 'start' && start) {
      if (pending) ranges.push(pending);
      pending = { start, cycle };
      continue;
    }

    if (event === 'end' && (end || start)) {
      const value = end || start;
      if (pending) {
        ranges.push({ ...pending, end: value, cycle: pending.cycle ?? cycle });
        pending = undefined;
      } else {
        ranges.push({ end: value, cycle });
      }
      continue;
    }

    if (start && end) {
      ranges.push({ start, end, cycle });
      continue;
    }

    if (start) {
      if (pending) ranges.push(pending);
      pending = { start, cycle };
      continue;
    }

    if (end) {
      if (pending) {
        ranges.push({ ...pending, end, cycle: pending.cycle ?? cycle });
        pending = undefined;
      } else {
        ranges.push({ end, cycle });
      }
    }
  }

  if (pending) ranges.push(pending);
  return ranges;
}

function materialList(data: Record<string, unknown>): LifecycleMaterial[] {
  const fields = lifecycleItemFields('relatedMaterials');
  const studyFields = lifecycleItemFields('relatedStudies');
  const materials: LifecycleMaterial[] = [];

  for (const record of recordList(
    rawSource(data, 'materials', 'relatedMaterials')
  )) {
    const name = fieldText(record, fields.name);
    if (!name) continue;
    materials.push({
      name,
      description: fieldText(record, fields.description) || undefined,
      url: fieldText(record, fields.url) || undefined,
      type: 'Document',
    });
  }

  for (const record of recordList(
    rawSource(data, 'materials', 'relatedStudies')
  )) {
    const name = fieldText(record, studyFields.name);
    if (!name) continue;
    materials.push({
      name,
      url: fieldText(record, studyFields.url) || undefined,
      type: 'Étude reliée',
    });
  }

  const website = sourceText(data, 'study', 'website');
  if (website) {
    materials.push({
      name: lifecycleLabel('studyWebsiteMaterialName', "Site web de l'enquête"),
      url: website,
      type: 'Site web',
    });
  }

  const bibliography: Array<[string, string]> = [
    ['archined', lifecycleLabel('archinedMaterialName', 'Bibliographie Archined')],
    ['zotero', lifecycleLabel('zoteroMaterialName', 'Bibliographie Zotero')],
  ];
  for (const [name, label] of bibliography) {
    const url = sourceText(data, 'materials', name);
    if (url) materials.push({ name: label, url, type: 'Bibliographie' });
  }

  const shortCitation = sourceText(data, 'study', 'shortCitation');
  if (shortCitation) {
    materials.push({
      name: lifecycleLabel('shortCitationMaterialName', 'Citation courte'),
      description: shortCitation,
      type: 'Note',
    });
  }

  const progedo = rawSource(data, 'access', 'progedo');
  const progedoAvailable =
    progedo === true ||
    ['true', 'oui', 'yes'].includes(cleanText(progedo).toLowerCase());
  if (progedoAvailable) {
    materials.push({
      name: lifecycleLabel(
        'accessMaterialName',
        "Conditions d'accès aux données"
      ),
      description: lifecycleLabel(
        'accessMaterialDescription',
        "Mise à disposition d'un FPR via Quetelet Progedo."
      ),
      type: 'Accès',
    });
  }

  for (const file of fileList(data)) {
    const details = [
      file.name,
      file.content,
      file.cases ? `${file.cases} observations` : '',
      file.variables ? `${file.variables} variables` : '',
      file.types.length > 0 ? `Type : ${file.types.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' — ');

    if (details) {
      materials.push({
        name: file.name
          ? `${lifecycleLabel('fileTypeLabel', 'Fichier')} ${file.name}`
          : lifecycleLabel('fileTypeLabel', 'Fichier de données'),
        description: details,
        type: 'Fichier de données',
      });
    }
  }

  return materials;
}

/** Remove characters that the DDI identifier pattern does not accept. */
export function lifecycleId(value: string, fallback = 'study'): string {
  const normalized = cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9*@$_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

/** Local identifier of a child object, scoped to its study. */
export function lifecycleObjectId(
  study: Pick<LifecycleStudy, 'id'>,
  suffix: string,
  index?: number
): string {
  return `${study.id}.${suffix}${index === undefined ? '' : index + 1}`;
}

/** Canonical DDI URN for a study or one of its child objects. */
export function lifecycleUrn(
  study: Pick<LifecycleStudy, 'agency' | 'version'>,
  localId: string
): string {
  return `urn:ddi:${study.agency}:${localId}:${study.version}`;
}

export type CogsDate =
  | { DateTime: string }
  | { Date: string }
  | { GYearMonth: { Year: number; Month: number; Timezone?: string } }
  | { GYear: { Year: number; Timezone?: string } }
  | { Duration: string };

/**
 * Normalise a stored date to the DDI 4 `cogsDate` arms. DDI 3.3 accepts the
 * same values directly through `BaseDateType`.
 */
export function toCogsDate(value: string | undefined): CogsDate | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  if (/^P/i.test(text)) return { Duration: text };
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    return { DateTime: text };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { Date: text };
  if (/^\d{4}-\d{2}$/.test(text)) {
    return {
      GYearMonth: {
        Year: Number(text.slice(0, 4)),
        Month: Number(text.slice(5, 7)),
      },
    };
  }
  if (/^\d{4}$/.test(text)) {
    return { GYear: { Year: Number(text) } };
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const iso = parsed.toISOString();
  return { Date: iso.slice(0, 10) };
}

/** ISO spelling of a normalised date, for DDI 3.3 `BaseDateType`. */
export function cogsDateValue(value: string | undefined): string | undefined {
  const cogs = toCogsDate(value);
  if (!cogs) return undefined;

  if ('GYear' in cogs) {
    return String(cogs.GYear.Year).padStart(4, '0');
  }
  if ('GYearMonth' in cogs) {
    return `${String(cogs.GYearMonth.Year).padStart(4, '0')}-${String(
      cogs.GYearMonth.Month
    ).padStart(2, '0')}`;
  }

  return Object.values(cogs)[0] as string;
}

/** ISO date value accepted by DDI 3.3 `BaseDateType`. */
export function lifecycleDateValue(value: string | undefined): string {
  return cogsDateValue(value) ?? '';
}

/** Build the normalised model shared by the 3.3 and 4.0 generators. */
export function buildLifecycleStudy(
  data: Record<string, unknown>,
  options: LifecycleGenerationOptions = {}
): LifecycleStudy {
  const mapping = DDI_LIFECYCLE_MAPPING;
  const versionStatements = versionStatementList(
    data,
    'versionStatements'
  );
  const firstVersion = versionStatements[0];

  const id = lifecycleId(
    sourceText(data, 'study', 'id'),
    options.fallbackId ?? 'study'
  );

  const version =
    firstVersion?.id && /^\d+(\.\d+)*$/.test(firstVersion.id)
      ? firstVersion.id
      : mapping.version;

  const title =
    sourceText(data, 'study', 'title') ||
    options.fallbackTitle ||
    lifecycleLabel('untitled', 'Étude sans titre');

  const timePeriods = dateRanges(data, 'coverage', 'timePeriods');
  const collectionDates = dateRanges(data, 'method', 'collectionDates');
  const kindsOfData = splitValues(
    sourceStrings(data, 'coverage', 'kindsOfData'),
    lifecycleListSeparators('kindsOfData')
  );

  const study: LifecycleStudy = {
    id,
    agency: mapping.agency,
    version,
    language: mapping.language,
    title,
    subtitle: sourceText(data, 'study', 'subtitle') || undefined,
    alternateTitle: sourceText(data, 'study', 'alternateTitle') || undefined,
    parallelTitle: sourceText(data, 'study', 'parallelTitle') || undefined,
    doi: sourceText(data, 'study', 'doi') || undefined,
    abstract: sourceText(data, 'study', 'abstract') || undefined,
    website: sourceText(data, 'study', 'website') || undefined,
    longCitation: sourceText(data, 'study', 'longCitation') || undefined,
    shortCitation: sourceText(data, 'study', 'shortCitation') || undefined,
    versionDate: firstVersion?.date || undefined,
    publicationDate:
      sourceText(data, 'study', 'distributionDate') ||
      sourceText(data, 'study', 'productionDate') ||
      undefined,
    authors: personList(data, 'authors'),
    contributors: personList(data, 'contributors'),
    referents: sourceStrings(data, 'study', 'referents'),
    metadataTeam: personList(data, 'metadataTeam'),
    producers: personList(data, 'producers'),
    distributors: distributorList(data),
    funders: funderList(data),
    dataCollectors: personList(data, 'dataCollectors', 'method'),
    keywords: keywordList(data),
    inedTopics: sourceStrings(data, 'coverage', 'inedTopics'),
    cessdaTopics: sourceStrings(data, 'coverage', 'cessdaTopics'),
    countries: sourceStrings(data, 'coverage', 'countries'),
    geographicCoverage:
      sourceText(data, 'coverage', 'geographicCoverage') || undefined,
    analysisUnits: sourceStrings(data, 'coverage', 'analysisUnits'),
    universe: sourceText(data, 'coverage', 'universe') || undefined,
    kindsOfData,
    timePeriods,
    collectionDates,
    collectionModes: sourceStrings(data, 'method', 'collectionModes'),
    collectionModeDetail:
      sourceText(data, 'method', 'collectionModeDetail') || undefined,
    instruments: sourceStrings(data, 'method', 'instruments'),
    instrumentDetail:
      sourceText(data, 'method', 'instrumentDetail') || undefined,
    timeMethods: sourceStrings(data, 'method', 'timeMethods'),
    samplingProcedures: sourceStrings(data, 'method', 'samplingProcedures'),
    samplingDetail:
      sourceText(data, 'method', 'samplingDetail') || undefined,
    frequency: sourceText(data, 'method', 'frequency') || undefined,
    collectionSituation:
      sourceText(data, 'method', 'collectionSituation') || undefined,
    weighting: sourceText(data, 'method', 'weighting') || undefined,
    cleaning: sourceText(data, 'method', 'cleaning') || undefined,
    responseRate: sourceText(data, 'method', 'responseRate') || undefined,
    dataQuality: sourceText(data, 'method', 'dataQuality') || undefined,
    materials: [],
    versionStatements,
    files: fileList(data),
  };

  study.materials = materialList(data);

  return study;
}
