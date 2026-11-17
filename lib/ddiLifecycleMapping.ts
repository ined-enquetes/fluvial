/**
 * Typed access to the parametric DDI Lifecycle conversion table.
 *
 * The table lives in `data/ddi-lifecycle-mapping.json` so that a curator can
 * change a source key, a DDI element name or a generated label without
 * touching the generators. This module is the only place that knows the file
 * layout; the 3.3 and 4.0 builders only ask for named values.
 */

import mappingData from '@/data/ddi-lifecycle-mapping.json';
import type { DdiLifecycleVersion } from './ddiXml';

type SourceEntry = string | string[];

export interface DdiLifecycleVersionConfig {
  format: 'xml' | 'json';
  mediaType: string;
  extension: string;
  namespace?: string;
  schemaLocation?: string;
  schema?: string;
  root: string;
  prefixes?: Record<string, string>;
}

export interface DdiLifecycleMappingFile {
  agency: string;
  language: string;
  version: string;
  versions: Record<DdiLifecycleVersion, DdiLifecycleVersionConfig>;
  labels: Record<string, string>;
  vocabularies: Record<string, string>;
  sources: Record<string, Record<string, SourceEntry>>;
  itemFields: Record<string, Record<string, string[]>>;
  listSeparators: Record<string, string[]>;
  elements: Record<DdiLifecycleVersion, Record<string, string>>;
}

export const DDI_LIFECYCLE_MAPPING =
  mappingData as unknown as DdiLifecycleMappingFile;

/** Source JSON keys for one logical field, in priority order. */
export function lifecycleSources(group: string, name: string): string[] {
  const entry = DDI_LIFECYCLE_MAPPING.sources[group]?.[name];
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

/** Item-level keys for a repeated group (people, files, materials...). */
export function lifecycleItemFields(
  group: string
): Record<string, string[]> {
  return DDI_LIFECYCLE_MAPPING.itemFields[group] ?? {};
}

/** DDI element or property name for one version. */
export function lifecycleElement(
  version: DdiLifecycleVersion,
  name: string
): string {
  const value = DDI_LIFECYCLE_MAPPING.elements[version]?.[name];
  if (!value) {
    throw new Error(
      `Correspondance DDI Lifecycle ${version} manquante pour « ${name} ».`
    );
  }
  return value;
}

export function lifecycleVersionConfig(
  version: DdiLifecycleVersion
): DdiLifecycleVersionConfig {
  return DDI_LIFECYCLE_MAPPING.versions[version];
}

export function lifecycleLabel(name: string, fallback = ''): string {
  return DDI_LIFECYCLE_MAPPING.labels[name] ?? fallback;
}

export function lifecycleVocabulary(name: string): string {
  return DDI_LIFECYCLE_MAPPING.vocabularies[name] ?? '';
}

export function lifecycleListSeparators(name: string): string[] {
  return DDI_LIFECYCLE_MAPPING.listSeparators[name] ?? [','];
}
