/**
 * Shared DDI XML primitives.
 *
 * These helpers are used by both the generator (`lib/ddi.ts`), the reverse
 * mapper (`lib/ddiImport.ts`) and the declarative field registry
 * (`lib/ddiMapping.ts`). Keeping them in one place means a mapping entry can
 * build the same kind of XML node as a hand-written builder.
 */

export type DdiVersion = '2.6' | '2.5' | '2.1';

export type XmlAttrs = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface XmlNode {
  name: string;
  attrs?: XmlAttrs;
  text?: string;
  children?: XmlNode[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean).join(', ');
  }
  return '';
}

/** Remove characters that XML 1.0 cannot represent. */
export function cleanText(value: unknown): string {
  return normalize(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/g, '')
    .trim();
}

export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

export function recordList(value: unknown): Record<string, unknown>[] {
  return asList(value).filter(isRecord);
}

export function firstString(
  record: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return '';
}

export function joinStrings(
  record: Record<string, unknown>,
  keys: string[]
): string {
  const values: string[] = [];

  for (const key of keys) {
    for (const item of asList(record[key])) {
      const value = cleanText(item);
      if (value && !values.includes(value)) values.push(value);
    }
  }

  return values.join('; ');
}

/** Read a list of values that may be strings, numbers or objects. */
export function valueList(value: unknown, keys: string[] = []): string[] {
  const values: string[] = [];

  for (const item of asList(value)) {
    const text = isRecord(item) ? firstString(item, keys) : cleanText(item);

    if (text && !values.includes(text)) values.push(text);
  }

  return values;
}

export function leaf(
  name: string,
  value: unknown,
  attrs?: XmlAttrs
): XmlNode | null {
  const text = cleanText(value);
  if (!text) return null;
  return { name, text, attrs };
}

export function branch(
  name: string,
  children: Array<XmlNode | null | undefined>,
  attrs?: XmlAttrs
): XmlNode | null {
  const filtered = children.filter((child): child is XmlNode => Boolean(child));
  if (filtered.length === 0) return null;
  return { name, attrs, children: filtered };
}

export function compact(nodes: Array<XmlNode | null | undefined>): XmlNode[] {
  return nodes.filter((node): node is XmlNode => Boolean(node));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderAttrs(attrs?: XmlAttrs): string {
  if (!attrs) return '';

  return Object.entries(attrs)
    .filter(
      ([, value]) =>
        value !== null && value !== undefined && String(value).trim() !== ''
    )
    .map(([key, value]) => ` ${key}="${escapeXml(String(value).trim())}"`)
    .join('');
}

export function renderNode(node: XmlNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const attrs = renderAttrs(node.attrs);

  if (!node.children || node.children.length === 0) {
    if (!node.text) return `${indent}<${node.name}${attrs}/>`;
    return `${indent}<${node.name}${attrs}>${escapeXml(
      node.text
    )}</${node.name}>`;
  }

  const lines = [`${indent}<${node.name}${attrs}>`];

  if (node.text) lines.push(`${indent}  ${escapeXml(node.text)}`);
  for (const child of node.children) {
    lines.push(renderNode(child, depth + 1));
  }

  lines.push(`${indent}</${node.name}>`);
  return lines.join('\n');
}
