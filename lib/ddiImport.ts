/**
 * DDI Codebook import.
 *
 * Parses a DDI Codebook 2.6, 2.5 or 2.1 XML document and maps it back to the
 * flat JSON object used by the application. The mapping is deliberately
 * tolerant: a DDI file produced by another tool may not contain every FLUVIAL
 * field, and some values (for example controlled-vocabulary codes) cannot be
 * recovered from their textual DDI representation.
 */

import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import type { DdiVersion } from './ddi';
import { DDI_FIELD_MAPPINGS } from './ddiMapping';

export interface DdiImportResult {
  version: DdiVersion;
  data: Record<string, unknown>;
  warnings: string[];
}

export class DdiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DdiImportError';
  }
}

type XmlRecord = Record<string, unknown>;

const MAX_XML_LENGTH = 10 * 1024 * 1024;

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodes(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function records(value: unknown): XmlRecord[] {
  // fast-xml-parser returns a plain string for an element without attributes.
  // Wrap those values so every mapper can treat elements uniformly.
  return nodes(value).map((node) =>
    isRecord(node) ? node : { '#text': node }
  );
}

function firstRecord(value: unknown): XmlRecord {
  return records(value)[0] ?? {};
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Extract visible text from a parsed XML node, preserving line breaks. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(textOf)
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (isRecord(value)) {
    const parts: string[] = [];

    if ('#text' in value) parts.push(textOf(value['#text']));

    for (const [key, child] of Object.entries(value)) {
      if (key === '#text' || key.startsWith('@_')) continue;
      parts.push(textOf(child));
    }

    return parts.filter(Boolean).join(' ').replace(/[ \t]+/g, ' ').trim();
  }

  return '';
}

function attr(value: unknown, name: string): string {
  return clean(firstRecord(value)[`@_${name}`]);
}

function list(value: unknown): string[] {
  return nodes(value).map(textOf).filter(Boolean);
}

function splitList(value: string): string[] {
  return value
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setString(
  data: Record<string, unknown>,
  key: string,
  value: string
): void {
  if (value) data[key] = value;
}

function setList(
  data: Record<string, unknown>,
  key: string,
  value: unknown[]
): void {
  if (value.length > 0) data[key] = value;
}

function toScalar(value: string): string | number {
  const text = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/**
 * Import the simple fields declared in `lib/ddiMapping.ts`.
 *
 * `parentRecord` is the parsed XML record for the mapping's parent path, so the
 * registry does not need to know how fast-xml-parser structures the document.
 */
function applyMappedFields(
  data: Record<string, unknown>,
  parentRecord: XmlRecord,
  version: DdiVersion,
  parent: string
): void {
  for (const mapping of DDI_FIELD_MAPPINGS) {
    if (mapping.parent !== parent) continue;
    if (mapping.versions && !mapping.versions.includes(version)) continue;

    if (mapping.kind === 'list') {
      const values = list(parentRecord[mapping.element]).map((value) =>
        mapping.numeric ? toScalar(value) : value
      );

      if (values.length === 0) continue;

      data[mapping.key] = mapping.singleAsScalar
        ? values.length === 1
          ? values[0]
          : values
        : values;

      continue;
    }

    setString(data, mapping.key, textOf(parentRecord[mapping.element]));
  }
}

function splitRange(value: string): [string, string] {
  const match = value.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!match) return [value.trim(), ''];
  return [match[1].trim(), match[2].trim()];
}

function partitionNumeric(values: string[]): {
  numeric: number[];
  textual: string[];
} {
  const numeric: number[] = [];
  const textual: string[] = [];

  for (const value of values) {
    const text = value.trim();
    if (/^\d+$/.test(text)) numeric.push(Number(text));
    else if (text) textual.push(text);
  }

  return { numeric, textual };
}

function mapVersionStatement(
  node: unknown,
  prefix: string,
  textKey: string
): XmlRecord | null {
  const record = firstRecord(node);
  const versionNode = firstRecord(record.version);
  const id = textOf(versionNode);
  const notes = textOf(record.notes);

  let date = attr(versionNode, 'date') || attr(record, 'date');
  let change = notes;

  const dateNote = notes.match(
    /^Date\s*:\s*(.+?)(?:\s+[—–-]\s+(.+))?$/i
  );

  if (dateNote) {
    if (!date) date = dateNote[1].trim();
    change = dateNote[2]?.trim() ?? '';
  }

  const result: XmlRecord = {};
  if (id) result[`${prefix}.id`] = id;
  if (change) result[`${prefix}.${textKey}`] = change;
  if (date) result[`${prefix}.date`] = date;

  if (Object.keys(result).length === 0) {
    const fallback = textOf(record);
    if (!fallback) return null;
    result[`${prefix}.${textKey}`] = fallback;
  }

  return result;
}

function detectVersion(root: XmlRecord, xml: string): DdiVersion {
  const declared = clean(root['@_version']) || attr(root, 'version');

  if (declared.startsWith('2.6')) return '2.6';
  if (declared.startsWith('2.5')) return '2.5';
  if (declared.startsWith('2.1')) return '2.1';
  if (/ddi:codebook:2_6/.test(xml)) return '2.6';
  if (/ddi:codebook:2_5/.test(xml)) return '2.5';
  if (/http:\/\/www\.icpsr\.umich\.edu\/DDI/.test(xml)) return '2.1';

  throw new DdiImportError(
    'Version DDI non reconnue. Utilisez un fichier DDI Codebook 2.6, 2.5 ou 2.1.'
  );
}

function parseXml(xml: string): XmlRecord {
  if (xml.length > MAX_XML_LENGTH) {
    throw new DdiImportError('Le fichier DDI est trop volumineux (10 Mo max).');
  }

  if (/<!DOCTYPE/i.test(xml)) {
    throw new DdiImportError(
      'Les fichiers DDI contenant une DTD ne sont pas pris en charge.'
    );
  }

  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    const details = error as { message?: string; line?: number };
    const message = details.message || 'XML mal formé.';
    const line = details.line ? ` (ligne ${details.line})` : '';
    throw new DdiImportError(`Fichier XML invalide : ${message}${line}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xml) as XmlRecord;
  const root = firstRecord(parsed.codeBook);

  if (Object.keys(root).length === 0) {
    throw new DdiImportError(
      "Le fichier ne contient pas d'élément <codeBook> DDI."
    );
  }

  return root;
}

/**
 * Convert a DDI Codebook XML document to the application's flat JSON format.
 */
export function importDdiCodebook(xml: string): DdiImportResult {
  const root = parseXml(xml);
  const version = detectVersion(root, xml);
  const data: Record<string, unknown> = {};
  const warnings: string[] = [];

  const study = firstRecord(root.stdyDscr);
  const studyCitation = firstRecord(study.citation);
  const docCitation = firstRecord(firstRecord(root.docDscr).citation);
  const citation =
    Object.keys(studyCitation).length > 0 ? studyCitation : docCitation;

  const titleStmt = firstRecord(citation.titlStmt);
  const docTitleStmt = firstRecord(docCitation.titlStmt);
  const resolvedTitleStmt =
    Object.keys(titleStmt).length > 0 ? titleStmt : docTitleStmt;

  const title =
    textOf(resolvedTitleStmt.titl).replace(
      /\s+[-–—]\s+Documentation DDI\s*$/i,
      ''
    ) || '';

  setString(data, 'titl', title);
  applyMappedFields(
    data,
    resolvedTitleStmt,
    version,
    'stdyDscr/citation/titlStmt'
  );

  const idNumbers = records(resolvedTitleStmt.IDNo);
  const plainId = idNumbers.find(
    (node) => !attr(node, 'agency') && !attr(node, 'role')
  );
  const doiId = idNumbers.find(
    (node) =>
      /doi/i.test(attr(node, 'agency')) || /doi/i.test(attr(node, 'role'))
  );

  setString(data, 'idno', textOf(plainId));
  setString(data, 'IDNo@DOI', textOf(doiId));

  // Metadata team (document description).
  const docResponseStatement = firstRecord(docCitation.rspStmt);
  const metadataTeam = records(docResponseStatement.AuthEnty)
    .map((node) => {
      const name = textOf(node);
      if (!name) return null;

      const result: XmlRecord = { 'docDscr@AuthEnty': name };
      const affiliations = splitList(attr(node, 'affiliation'));
      if (affiliations.length > 0) {
        result['docDscr@AuthEnty@affliliation'] = affiliations;
      }
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'rspStmt', metadataTeam);

  // Research team and contributors (study citation).
  const responseStatement = firstRecord(citation.rspStmt);
  const authors = records(responseStatement.AuthEnty)
    .map((node) => {
      const name = textOf(node);
      if (!name) return null;

      const result: XmlRecord = { AuthEnty: name };
      const affiliations = splitList(attr(node, 'affiliation'));
      if (affiliations.length > 0) {
        result['AuthEnty@affiliation'] = affiliations;
      }
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'rech', authors);

  const referents: string[] = [];
  const contributors: XmlRecord[] = [];

  for (const node of records(responseStatement.othId)) {
    const name = textOf(node);
    if (!name) continue;

    const role = attr(node, 'role');

    if (/ing[ée]nieur/i.test(role) && /r[ée]f[ée]rent/i.test(role)) {
      referents.push(name);
      continue;
    }

    const result: XmlRecord = { othId: name };
    const affiliations = splitList(attr(node, 'affiliation'));
    if (affiliations.length > 0) {
      result['othId@affiliation'] = affiliations;
    }
    if (role) result['othId@role'] = role;
    contributors.push(result);
  }

  setList(data, 'ingeref', referents);
  setList(data, 'contrib', contributors);

  // Production and funding.
  const productionStatement = firstRecord(citation.prodStmt);

  const producers = records(productionStatement.producer)
    .map((node) => {
      const name = textOf(node);
      if (!name) return null;

      const result: XmlRecord = { producer: name };
      const role = attr(node, 'role');
      if (role) result['producer@role'] = role;
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'producerHandler', producers);
  setString(data, 'prodDate', textOf(productionStatement.prodDate));

  const funders = records(productionStatement.fundAg)
    .map((node) => {
      const name = textOf(node);
      if (!name) return null;

      const result: XmlRecord = { 'financer@name': name };
      const role = attr(node, 'role');
      if (role) result['financer@role'] = role;
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  for (const node of records(productionStatement.grantNo)) {
    const number = textOf(node);
    if (!number) continue;

    const agency = attr(node, 'agency');
    const matched = funders.find(
      (funder) => clean(funder['financer@name']) === agency
    );

    if (matched) {
      matched['financer@number'] = number;
    } else {
      const result: XmlRecord = { 'financer@number': number };
      if (agency) result['financer@name'] = agency;
      funders.push(result);
    }
  }

  setList(data, 'financer', funders);

  // Distribution.
  const distributionStatement = firstRecord(citation.distStmt);

  const distributors = records(distributionStatement.distrbtr)
    .map((node) => {
      const result: XmlRecord = {};
      const name = textOf(node);
      const id = attr(node, 'ID');
      const abbr = attr(node, 'abbr') || id;
      const uri = attr(node, 'URI');
      const affiliation = attr(node, 'affiliation');

      if (name) result['distrbtr.name'] = name;
      if (id) result['distrbtr.ID'] = id;
      if (abbr) result['distrbtr.abbr'] = abbr;
      if (uri) result['distrbtr.URI'] = uri;
      if (affiliation) result['distrbtr@affiliation'] = affiliation;

      return Object.keys(result).length > 0 ? result : null;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'distrbtr', distributors);
  setString(data, 'distDate', textOf(distributionStatement.distDate));

  // Citation versions.
  const versions = records(citation.verStmt)
    .map((node) => mapVersionStatement(node, 'verStmt', 'text'))
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'verStmts', versions);

  // Holdings: website and DataIned link.
  for (const node of records(citation.holdings)) {
    const uri = attr(node, 'URI');
    if (!uri) continue;

    const label = textOf(node);

    if (/site\s*web/i.test(label) && !data.website) {
      data.website = uri;
    } else if (/data\s*ined/i.test(label) && !data.url) {
      data.url = uri;
    } else if (!data.website) {
      data.website = uri;
    } else if (!data.url) {
      data.url = uri;
    }
  }

  setString(data, 'citLONG', textOf(citation.biblCit));

  // Study information.
  const studyInfo = firstRecord(study.stdyInfo);
  let abstract = textOf(studyInfo.abstract);

  const subject = firstRecord(studyInfo.subject);

  const keywords = records(subject.keyword)
    .map((node): XmlRecord | null => {
      const text = textOf(node);
      if (!text) return null;

      const vocabURI = attr(node, 'vocabURI');
      return vocabURI
        ? { keyword: text, 'keyword@vocabURI': vocabURI }
        : { keyword: text };
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'keywords', keywords);

  const inedTopics: string[] = [];
  const cessdaTopics: string[] = [];

  for (const node of records(subject.topcClas)) {
    const text = textOf(node);
    if (!text) continue;

    const vocabulary = attr(node, 'vocab');

    if (/cessda/i.test(vocabulary)) cessdaTopics.push(text);
    else if (/ined/i.test(vocabulary)) inedTopics.push(text);
    else if (vocabulary) {
      warnings.push(
        `Thème « ${text} » : vocabulaire « ${vocabulary} » non reconnu, classé dans les thèmes INED.`
      );
      inedTopics.push(text);
    } else {
      inedTopics.push(text);
    }
  }

  setList(data, 'topcClas@Ined', inedTopics);
  setList(data, 'topcClas@Cessda', cessdaTopics);

  const summary = firstRecord(studyInfo.sumDscr);

  const timePeriods = records(summary.timePrd)
    .map((node) => {
      const result: XmlRecord = {};
      let start = attr(node, 'start');
      let end = attr(node, 'end');
      const date = attr(node, 'date');
      const text = textOf(node);

      if (!start && !end) {
        if (date) start = date;
        else [start, end] = splitRange(text);
      }

      if (start) result['timePrd@start'] = start;
      if (end) result['timePrd@end'] = end;

      const event = attr(node, 'event');
      const cycle = attr(node, 'cycle');
      if (event) result['timePrd@event'] = event;
      if (cycle) result['timePrd@cycle'] = cycle;

      return Object.keys(result).length > 0 ? result : null;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'timePrd', timePeriods);

  const collectionDates = records(summary.collDate)
    .map((node) => {
      const result: XmlRecord = {};
      let start = attr(node, 'start');
      let end = attr(node, 'end');
      const text = textOf(node);

      if (!start && !end) [start, end] = splitRange(text);

      if (start) result['collDate@start'] = start;
      if (end) result['collDate@end'] = end;

      const cycle = attr(node, 'cycle');
      const event = attr(node, 'event');
      if (cycle) result['collDate@cycle'] = cycle;
      if (event) result['collDate@event'] = event;

      return Object.keys(result).length > 0 ? result : null;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'collDate', collectionDates);

  applyMappedFields(data, summary, version, 'stdyDscr/stdyInfo/sumDscr');

  for (const note of list(studyInfo.notes)) {
    const shortCitation = note.match(/^Citation courte\s*:\s*(.+)$/i);

    if (shortCitation) {
      setString(data, 'citCOURT', shortCitation[1].trim());
      continue;
    }

    abstract = [abstract, note].filter(Boolean).join('\n\n');
  }

  setString(data, 'abstract', abstract);

  // Method.
  const method = firstRecord(study.method);
  applyMappedFields(data, method, version, 'stdyDscr/method');
  const dataCollection = firstRecord(method.dataColl);

  const dataCollectors = records(dataCollection.dataCollector)
    .map((node) => {
      const name = textOf(node);
      if (!name) return null;

      const result: XmlRecord = { dataCollector: name };
      const abbr = attr(node, 'abbr');
      const affiliation = attr(node, 'affiliation');
      if (abbr) result['dataCollector@abbr'] = abbr;
      if (affiliation) result['dataCollector@affiliation'] = affiliation;
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'dataCollectors', dataCollectors);

  const timeMethods = list(dataCollection.timeMeth).map(toScalar);
  setList(data, 'timeMeth', timeMethods);

  setString(data, 'frequenc', textOf(dataCollection.frequenc));
  setString(data, 'collSitu', textOf(dataCollection.collSitu));
  setString(data, 'weight', textOf(dataCollection.weight));
  setString(data, 'cleanOps', textOf(dataCollection.cleanOps));

  const samplingProcedures = list(dataCollection.sampProc);
  const sampling = partitionNumeric(samplingProcedures);
  setList(data, 'sampProcVC', sampling.numeric);
  setString(data, 'sampProc', sampling.textual.join('\n'));

  const collectionModes = list(dataCollection.collMode);
  const modes = partitionNumeric(collectionModes);
  setList(data, 'collModeCV', modes.numeric);
  setString(data, 'collMode', modes.textual.join('\n'));

  const instruments = list(dataCollection.resInstru);
  const instrumentValues = partitionNumeric(instruments);
  setList(data, 'resInstruCV', instrumentValues.numeric);
  setString(data, 'resInstru', instrumentValues.textual.join('\n'));

  const analysisInfo = firstRecord(method.anlyInfo);
  applyMappedFields(data, analysisInfo, version, 'stdyDscr/method/anlyInfo');

  // Data access.
  const dataAccess = firstRecord(study.dataAccs);
  if (Object.keys(dataAccess).length > 0) {
    data.madProgedo = true;
  }

  // Related materials and studies.
  const relatedMaterials = firstRecord(study.othrStdyMat);

  const relatedStudies = records(relatedMaterials.relStdy)
    .map((node) => {
      let text = textOf(node);
      let uri = attr(node, 'URI');

      const embeddedUrl = text.match(
        /^(.*?)\s+[—–-]\s+(https?:\/\/\S+)\s*$/i
      );

      if (embeddedUrl) {
        text = embeddedUrl[1].trim();
        uri = uri || embeddedUrl[2].trim();
      }

      if (!text && !uri) return null;

      const result: XmlRecord = {};
      if (text) result.relStdy = text;
      else result.relStdy = uri;
      if (uri) result['relStdy@URI'] = uri;
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'relStdies', relatedStudies);

  const resources = records(relatedMaterials.relMat)
    .map((node) => {
      const label = attr(node, 'label');
      const uri = attr(node, 'URI');
      let description = textOf(node);
      let url = uri;

      const embeddedUrl = description.match(
        /^(.*?)\s+[—–-]\s+(https?:\/\/\S+)\s*$/i
      );

      if (embeddedUrl) {
        description = embeddedUrl[1].trim();
        url = url || embeddedUrl[2].trim();
      }

      if (!label && !description && !url) return null;

      const result: XmlRecord = {};
      result.relMat = label || description || url;
      if (description) result['relMat@description'] = description;
      if (url) result['relMat@url'] = url;
      return result;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'relMats', resources);

  for (const node of records(relatedMaterials.othRefs)) {
    const text = textOf(node);
    if (!text) continue;

    const archined = text.match(/^Bibliographie Archined\s*:\s*(.+)$/i);
    const zotero = text.match(/^Bibliographie Zotero\s*:\s*(.+)$/i);

    if (archined) {
      data['relCit@arch'] = [data['relCit@arch'], archined[1].trim()]
        .filter(Boolean)
        .join('\n');
    } else if (zotero) {
      data['relCit@ged'] = [data['relCit@ged'], zotero[1].trim()]
        .filter(Boolean)
        .join('\n');
    } else {
      data['relCit@arch'] = [data['relCit@arch'], text]
        .filter(Boolean)
        .join('\n');
    }
  }

  // File descriptions.
  const fileDescriptions = records(root.fileDscr)
    .map((file) => {
      const fileTxt = firstRecord(file.fileTxt);
      const result: XmlRecord = {};

      const fileNames = list(fileTxt.fileName);
      if (fileNames.length > 0) result.fileName = fileNames.join('; ');

      setString(result, 'fileCont', textOf(fileTxt.fileCont));

      const caseQuantity = textOf(firstRecord(fileTxt.dimensns).caseQnty);
      const variableQuantity = textOf(firstRecord(fileTxt.dimensns).varQnty);

      if (caseQuantity) result.caseQnty = toScalar(caseQuantity);
      if (variableQuantity) result.varQnty = toScalar(variableQuantity);

      const fileTypes = list(fileTxt.fileType);
      if (fileTypes.length > 0) result.fileType = fileTypes;

      const versions = records(fileTxt.verStmt)
        .map((node) => mapVersionStatement(node, 'file.verStmt', 'txt'))
        .filter((node): node is XmlRecord => node !== null);

      if (versions.length > 0) result['file.verStmts'] = versions;

      return Object.keys(result).length > 0 ? result : null;
    })
    .filter((node): node is XmlRecord => node !== null);

  setList(data, 'fileDscrs', fileDescriptions);

  if (Object.keys(data).length === 0) {
    throw new DdiImportError(
      "Aucune métadonnée exploitable n'a été trouvée dans le fichier DDI."
    );
  }

  return { version, data, warnings };
}
