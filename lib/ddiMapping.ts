/**
 * Declarative DDI field registry.
 *
 * Every entry maps one flat JSON key (the SurveyJS question name) to one DDI
 * element under a fixed parent path. The same registry drives export and
 * import, so a simple scalar or list field only has to be declared once.
 *
 * Only "leaf" mappings belong here. Complex structures (people, repeated
 * groups, elements whose attributes come from other JSON keys, or sections
 * whose children have to be interleaved with computed nodes) stay in the
 * hand-written builders of `lib/ddi.ts` / `lib/ddiImport.ts`.
 *
 * See `docs/DDI.md` for the full workflow and for the list of parents already
 * wired to the registry.
 */

import type { DdiVersion, XmlNode } from './ddiXml';
import { firstString, isRecord, leaf, valueList } from './ddiXml';

export interface DdiFieldMapping {
  /** Key in `responses.json` (the SurveyJS question name). */
  key: string;
  /** DDI element name, for example `geogCover`. */
  element: string;
  /**
   * Parent path from `<codeBook>`, slash separated. The parent must already
   * exist in the generated tree, and the registry nodes are emitted at the
   * exact place where the builder calls `mappedNodes()`.
   */
  parent: string;
  /** `text` (default) emits one element; `list` emits one element per value. */
  kind?: 'text' | 'list';
  /** JSON keys to try, in order. Defaults to `[key]`. */
  sourceKeys?: string[];
  /** Keys to try when a list item is an object. */
  itemKeys?: string[];
  /** Static XML attributes added to every emitted element. */
  attrs?: Record<string, string>;
  /** Convert numeric-looking values to numbers on import. */
  numeric?: boolean;
  /** Store a single list value as a scalar instead of a one-item array. */
  singleAsScalar?: boolean;
  /** Restrict the mapping to some DDI versions. */
  versions?: DdiVersion[];
}

/**
 * Simple fields managed by the registry.
 *
 * The order inside a parent is the order of the entries below. That order must
 * match the DDI schema sequence: adding an entry in the wrong position can
 * produce XML that is well-formed but schema-invalid.
 */
export const DDI_FIELD_MAPPINGS: DdiFieldMapping[] = [
  // Study title statement: study level and documentation level.
  {
    key: 'subTitl',
    element: 'subTitl',
    parent: 'stdyDscr/citation/titlStmt',
  },
  {
    key: 'altTitl',
    element: 'altTitl',
    parent: 'stdyDscr/citation/titlStmt',
  },
  {
    key: 'parTitl',
    element: 'parTitl',
    parent: 'stdyDscr/citation/titlStmt',
  },

  // Summary data description.
  {
    key: 'nation',
    element: 'nation',
    parent: 'stdyDscr/stdyInfo/sumDscr',
    kind: 'list',
    itemKeys: ['nation', 'value', 'title', 'label'],
  },
  {
    key: 'geogCover',
    element: 'geogCover',
    parent: 'stdyDscr/stdyInfo/sumDscr',
  },
  {
    key: 'geogUnit',
    element: 'geogUnit',
    parent: 'stdyDscr/stdyInfo/sumDscr',
  },
  {
    key: 'analyUnit',
    element: 'anlyUnit',
    parent: 'stdyDscr/stdyInfo/sumDscr',
    kind: 'list',
    sourceKeys: ['analyUnit', 'anlyUnit'],
    itemKeys: ['analyUnit', 'anlyUnit', 'value', 'title', 'label'],
    numeric: true,
    singleAsScalar: true,
  },
  {
    key: 'universe',
    element: 'universe',
    parent: 'stdyDscr/stdyInfo/sumDscr',
  },
  {
    key: 'dataKind',
    element: 'dataKind',
    parent: 'stdyDscr/stdyInfo/sumDscr',
  },

  // Analysis information.
  {
    key: 'respRate',
    element: 'respRate',
    parent: 'stdyDscr/method/anlyInfo',
  },
  {
    key: 'dataAppr',
    element: 'dataAppr',
    parent: 'stdyDscr/method/anlyInfo',
    sourceKeys: ['dataAppr', 'Évaluation de la qualité des données'],
  },
];

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function firstValue(
  data: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (hasValue(data[key])) return data[key];
  }
  return undefined;
}

/** Build the registry-managed nodes for one parent path. */
export function mappedNodes(
  parent: string,
  data: Record<string, unknown>,
  version: DdiVersion
): XmlNode[] {
  const nodes: XmlNode[] = [];

  for (const mapping of DDI_FIELD_MAPPINGS) {
    if (mapping.parent !== parent) continue;
    if (mapping.versions && !mapping.versions.includes(version)) continue;

    if (mapping.kind === 'list') {
      const value = firstValue(data, mapping.sourceKeys ?? [mapping.key]);
      const items = valueList(
        value,
        mapping.itemKeys ?? [mapping.element, 'value', 'title', 'label']
      );

      for (const item of items) {
        const node = leaf(mapping.element, item, mapping.attrs);
        if (node) nodes.push(node);
      }

      continue;
    }

    const text = firstString(data, mapping.sourceKeys ?? [mapping.key]);
    const node = leaf(mapping.element, text, mapping.attrs);
    if (node) nodes.push(node);
  }

  return nodes;
}
