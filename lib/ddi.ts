/**
 * DDI Codebook export.
 *
 * The application stores survey metadata as a flat JSON object. This module
 * converts that object into a DDI Codebook document on demand, for DDI 2.6,
 * 2.5 or 2.1. DDI 2.6 is backward compatible with 2.5, so it shares the same
 * generation path unless a field needs a version-specific shape.
 *
 * The mapping intentionally stays conservative: every emitted element is part
 * of the official schemas, and information that has no direct DDI counterpart
 * is kept as readable text in a suitable element (for example `notes`).
 */

import {
  DdiVersion,
  XmlAttrs,
  XmlNode,
  asList,
  branch,
  cleanText,
  compact,
  firstString,
  isRecord,
  joinStrings,
  leaf,
  recordList,
  renderNode,
  valueList,
} from './ddiXml';
import { mappedNodes } from './ddiMapping';

export type { DdiVersion } from './ddiXml';

export interface DdiGenerationOptions {
  version: DdiVersion;
  fallbackTitle?: string;
}

const DDI_NAMESPACES: Record<DdiVersion, string> = {
  '2.6': 'ddi:codebook:2_6',
  '2.5': 'ddi:codebook:2_5',
  '2.1': 'http://www.icpsr.umich.edu/DDI',
};

const DDI_SCHEMA_URLS: Record<DdiVersion, string> = {
  '2.6':
    'https://ddialliance.org/Specification/DDI-Codebook/2.6/XMLSchema/codebook.xsd',
  '2.5':
    'https://ddialliance.org/Specification/DDI-Codebook/2.5/XMLSchema/codebook.xsd',
  '2.1':
    'https://ddialliance.org/Specification/DDI-Codebook/2.1/XMLSchema/Version2-1.xsd',
};

function personNode(
  name: string,
  record: Record<string, unknown>,
  nameKeys: string[],
  affiliationKeys: string[],
  roleKeys: string[] = []
): XmlNode | null {
  const value = firstString(record, nameKeys);
  if (!value) return null;

  const affiliation = joinStrings(record, affiliationKeys);
  const role = joinStrings(record, roleKeys);

  return {
    name,
    text: value,
    attrs: {
      affiliation: affiliation || undefined,
      role: role || undefined,
    },
  };
}

function versionStatementNode(
  record: Record<string, unknown>,
  version: DdiVersion,
  keyPrefix = 'verStmt'
): XmlNode | null {
  // DDI 2.6 is backward compatible with 2.5 and uses the same shape here.
  const is25 = version !== '2.1';
  const id = firstString(record, [
    `${keyPrefix}.id`,
    'id',
    'version',
  ]);
  const change = firstString(record, [
    `${keyPrefix}.text`,
    `${keyPrefix}.txt`,
    'text',
    'txt',
  ]);
  const date = firstString(record, [`${keyPrefix}.date`, 'date']);

  if (!id && !change && !date) return null;

  const versionAttrs: XmlAttrs = { type: 'version' };
  if (!is25 && date) versionAttrs.date = date;

  const versionText = id || change || date;

  const noteParts: string[] = [];
  if (is25 && date) noteParts.push(`Date : ${date}`);
  if (id && change) noteParts.push(change);

  return branch('verStmt', [
    leaf('version', versionText, versionAttrs),
    noteParts.length > 0 ? leaf('notes', noteParts.join(' — ')) : null,
  ]);
}

function keywordNodes(value: unknown): XmlNode[] {
  return compact(
    asList(value).flatMap((item): Array<XmlNode | null> => {
      if (isRecord(item)) {
        const text = firstString(item, ['keyword', 'value', 'label', 'name']);
        return text
          ? [
              leaf('keyword', text, {
                vocabURI:
                  firstString(item, ['keyword@vocabURI', 'vocabURI']) ||
                  undefined,
              }),
            ]
          : [];
      }

      const text = cleanText(item);
      return text ? [leaf('keyword', text)] : [];
    })
  );
}

function topicClassNodes(value: unknown, vocabulary: string): XmlNode[] {
  return compact(
    valueList(value, ['topcClas', 'value', 'label', 'name']).map((text) =>
      leaf('topcClas', text, { vocab: vocabulary })
    )
  );
}

function buildTitleStatement(
  data: Record<string, unknown>,
  title: string,
  version: DdiVersion
): XmlNode | null {
  const idNumbers = compact([
    leaf('IDNo', data.idno),
    leaf('IDNo', firstString(data, ['IDNo@DOI', 'doi']), { agency: 'DOI' }),
  ]);

  return branch('titlStmt', [
    leaf('titl', title),
    ...mappedNodes('stdyDscr/citation/titlStmt', data, version),
    ...idNumbers,
  ]);
}

function buildDocDescription(
  data: Record<string, unknown>,
  title: string
): XmlNode {
  const metadataTeam = recordList(data.rspStmt)
    .map((record) =>
      personNode(
        'AuthEnty',
        record,
        ['docDscr@AuthEnty', 'AuthEnty', 'name'],
        [
          'docDscr@AuthEnty@affliliation',
          'docDscr@AuthEnty@affiliation',
          'AuthEnty@affiliation',
          'affiliation',
        ]
      )
    )
    .filter((node): node is XmlNode => Boolean(node));

  return {
    name: 'docDscr',
    children: compact([
      branch('citation', [
        branch('titlStmt', [
          leaf('titl', `${title} — Documentation DDI`),
          leaf('altTitl', data.altTitl),
        ]),
        branch('rspStmt', metadataTeam),
      ]),
    ]),
  };
}

function buildStudyCitation(
  data: Record<string, unknown>,
  title: string,
  version: DdiVersion
): XmlNode | null {
  const authors = recordList(data.rech).map((record) =>
    personNode(
      'AuthEnty',
      record,
      ['AuthEnty', 'name'],
      ['AuthEnty@affiliation', 'AuthEnty@affliliation', 'affiliation']
    )
  );

  const referents = valueList(data.ingeref).map((name) =>
    leaf('othId', name, { role: 'Ingénieur référent' })
  );

  const contributors = recordList(data.contrib).map((record) =>
    personNode(
      'othId',
      record,
      ['othId', 'name'],
      ['othId@affiliation', 'othId@affliliation', 'affiliation'],
      ['othId@role', 'role']
    )
  );

  const producers = recordList(data.producerHandler).map((record) => {
    const name = firstString(record, ['producer', 'name']);
    return name
      ? leaf('producer', name, {
          role: firstString(record, ['producer@role', 'role']) || undefined,
        })
      : null;
  });

  const funders = recordList(data.financer).map((record) => {
    const name = firstString(record, ['financer@name', 'name']);
    if (!name) return null;
    return leaf('fundAg', name, {
      role: firstString(record, ['financer@role', 'role']) || undefined,
    });
  });

  const grants = recordList(data.financer).map((record) => {
    const number = firstString(record, ['financer@number', 'number']);
    if (!number) return null;
    return leaf('grantNo', number, {
      agency: firstString(record, ['financer@name', 'name']) || undefined,
    });
  });

  const distributors = recordList(data.distrbtr).map((record) => {
    const name = firstString(record, ['distrbtr.name', 'name']);
    if (!name) return null;
    const distributorId = firstString(record, ['distrbtr.ID', 'ID']);
    // `ID` is an xs:ID, so only emit it when it is a valid NCName.
    const validId =
      distributorId && /^[A-Za-z_][A-Za-z0-9._-]*$/.test(distributorId)
        ? distributorId
        : undefined;
    return leaf('distrbtr', name, {
      ID: validId,
      abbr:
        firstString(record, ['distrbtr.abbr', 'abbr']) ||
        distributorId ||
        undefined,
      affiliation:
        firstString(record, ['distrbtr@affiliation', 'affiliation']) ||
        undefined,
      URI:
        firstString(record, ['distrbtr.URI', 'URI', 'url']) || undefined,
    });
  });

  const versions = recordList(data.verStmts).map((record) =>
    versionStatementNode(record, version)
  );

  const holdings = compact([
    leaf('holdings', "Site web de l'enquête", {
      URI: firstString(data, ['website']) || undefined,
    }),
    leaf('holdings', 'DataIned', {
      URI: firstString(data, ['url']) || undefined,
    }),
  ]);

  return branch('citation', [
    buildTitleStatement(data, title, version),
    branch('rspStmt', [...authors, ...referents, ...contributors]),
    branch('prodStmt', [
      ...producers,
      leaf('prodDate', data.prodDate),
      ...funders,
      ...grants,
    ]),
    branch('distStmt', [
      ...distributors,
      leaf('distDate', data.distDate),
    ]),
    ...compact(versions),
    leaf('biblCit', data.citLONG),
    ...holdings,
  ]);
}

function buildStudyInfo(
  data: Record<string, unknown>,
  version: DdiVersion
): XmlNode | null {
  const subjectChildren = compact([
    ...keywordNodes(data.keywords),
    ...topicClassNodes(data['topcClas@Ined'], 'INED'),
    ...topicClassNodes(data['topcClas@Cessda'], 'CESSDA'),
  ]);

  const timePeriods = recordList(data.timePrd).map((record) => {
    const start = firstString(record, ['timePrd@start', 'start']);
    const end = firstString(record, ['timePrd@end', 'end']);
    const direct = firstString(record, ['timePrd', 'date', 'value']);
    const text = direct || [start, end].filter(Boolean).join(' — ');
    return leaf('timePrd', text, {
      event: firstString(record, ['timePrd@event', 'event']) || undefined,
      cycle: firstString(record, ['timePrd@cycle', 'cycle']) || undefined,
    });
  });

  const collectionDates = recordList(data.collDate).map((record) => {
    const start = firstString(record, ['collDate@start', 'start']);
    const end = firstString(record, ['collDate@end', 'end']);
    const direct = firstString(record, ['collDate', 'date', 'value']);
    const text = direct || [start, end].filter(Boolean).join(' — ');
    return leaf('collDate', text, {
      cycle: firstString(record, ['collDate@cycle', 'cycle']) || undefined,
    });
  });

  const summaryChildren = compact([
    ...timePeriods,
    ...collectionDates,
    ...mappedNodes('stdyDscr/stdyInfo/sumDscr', data, version),
  ]);

  const shortCitation = firstString(data, ['citCOURT']);

  return branch('stdyInfo', [
    branch('subject', subjectChildren),
    leaf('abstract', data.abstract),
    branch('sumDscr', summaryChildren),
    shortCitation ? leaf('notes', `Citation courte : ${shortCitation}`) : null,
  ]);
}

function buildMethod(
  data: Record<string, unknown>,
  version: DdiVersion
): XmlNode | null {
  const dataCollectors = recordList(data.dataCollectors).map((record) => {
    const name = firstString(record, ['dataCollector', 'name']);
    if (!name) return null;
    return leaf('dataCollector', name, {
      abbr: firstString(record, ['dataCollector@abbr', 'abbr']) || undefined,
      affiliation:
        firstString(record, ['dataCollector@affiliation', 'affiliation']) ||
        undefined,
    });
  });

  const timeMethods = valueList(data.timeMeth, ['timeMeth', 'value', 'title'])
    .map((method) => leaf('timeMeth', method));

  const samplingProcedures = compact([
    ...valueList(data.sampProcVC, ['sampProcVC', 'value', 'title']).map(
      (procedure) => leaf('sampProc', procedure)
    ),
    leaf('sampProc', data.sampProc),
  ]);

  const collectionModes = compact([
    ...valueList(data.collModeCV, ['collModeCV', 'value', 'title']).map(
      (mode) => leaf('collMode', mode)
    ),
    leaf('collMode', data.collMode),
  ]);

  const instruments = compact([
    ...valueList(data.resInstruCV, ['resInstruCV', 'value', 'title']).map(
      (instrument) => leaf('resInstru', instrument)
    ),
    leaf('resInstru', data.resInstru),
  ]);

  const dataCollection = branch('dataColl', [
    ...timeMethods,
    ...dataCollectors,
    leaf('frequenc', data.frequenc),
    ...samplingProcedures,
    ...collectionModes,
    ...instruments,
    leaf('collSitu', data.collSitu),
    leaf('weight', data.weight),
    leaf('cleanOps', data.cleanOps),
  ]);

  const analysisInfo = branch(
    'anlyInfo',
    mappedNodes('stdyDscr/method/anlyInfo', data, version)
  );

  return branch('method', [
    dataCollection,
    ...mappedNodes('stdyDscr/method', data, version),
    analysisInfo,
  ]);
}

function buildAccess(data: Record<string, unknown>): XmlNode | null {
  const available = data.madProgedo;

  if (available !== true && cleanText(available).toLowerCase() !== 'true') {
    return null;
  }

  return branch('dataAccs', [
    branch('setAvail', [
      leaf(
        'notes',
        "Mise à disposition d'un FPR (Fichier de Production et de Recherche) via Quetelet Progedo."
      ),
    ]),
  ]);
}

function buildRelatedMaterials(
  data: Record<string, unknown>
): XmlNode | null {
  const relatedMaterials = recordList(data.relMats).map((record) => {
    const name = firstString(record, ['relMat', 'name', 'title']);
    const description = firstString(record, [
      'relMat@description',
      'description',
    ]);
    const url = firstString(record, [
      'relMat@url',
      'relMat@URI',
      'question10',
      'url',
    ]);

    const text = [description, url].filter(Boolean).join(' — ') || name;
    if (!text) return null;

    return leaf('relMat', text, { label: name || undefined });
  });

  const relatedStudies = recordList(data.relStdies).map((record) => {
    const name = firstString(record, ['relStdy', 'name', 'title']);
    const url = firstString(record, ['relStdy@URI', 'URI', 'url']);
    const text = [name, url].filter(Boolean).join(' — ');
    return text ? leaf('relStdy', text) : null;
  });

  const otherReferences = compact([
    leaf(
      'othRefs',
      firstString(data, ['relCit@arch'])
        ? `Bibliographie Archined : ${firstString(data, ['relCit@arch'])}`
        : null
    ),
    leaf(
      'othRefs',
      firstString(data, ['relCit@ged'])
        ? `Bibliographie Zotero : ${firstString(data, ['relCit@ged'])}`
        : null
    ),
  ]);

  return branch('othrStdyMat', [
    ...relatedMaterials,
    ...relatedStudies,
    ...otherReferences,
  ]);
}

function buildFileDescriptions(
  data: Record<string, unknown>,
  version: DdiVersion
): XmlNode[] {
  // DDI 2.6 keeps the repeatable 2.5 file description elements.
  const is25 = version !== '2.1';

  return recordList(data.fileDscrs).flatMap((record) => {
    const names = valueList(record.fileName, ['fileName', 'name']);
    const content = firstString(record, ['fileCont', 'content']);
    const caseQuantity = firstString(record, ['caseQnty', 'cases']);
    const variableQuantity = firstString(record, ['varQnty', 'variables']);
    const fileTypes = valueList(record.fileType, ['fileType', 'value', 'label']);
    const versions = recordList(record['file.verStmts']);

    const fileText = branch('fileTxt', [
      ...(is25
        ? names.map((name) => leaf('fileName', name))
        : names.length > 0
          ? [leaf('fileName', names[0])]
          : []),
      leaf('fileCont', content),
      branch('dimensns', [
        leaf('caseQnty', caseQuantity),
        leaf('varQnty', variableQuantity),
      ]),
      ...(is25
        ? fileTypes.map((type) => leaf('fileType', type))
        : fileTypes.length > 0
          ? [leaf('fileType', fileTypes[0])]
          : []),
      ...(is25
        ? versions.map((entry) =>
            versionStatementNode(entry, version, 'file.verStmt')
          )
        : versions.length > 0
          ? [versionStatementNode(versions[0], version, 'file.verStmt')]
          : []),
    ]);

    return fileText ? [{ name: 'fileDscr', children: [fileText] }] : [];
  });
}

/**
 * Convert stored survey JSON into a DDI Codebook XML document.
 */
export function generateDdiCodebook(
  data: Record<string, unknown>,
  options: DdiGenerationOptions
): string {
  const { version } = options;
  const title =
    firstString(data, ['titl', 'title']) ||
    options.fallbackTitle ||
    'Étude sans titre';

  const standardStudyDescription = branch('stdyDscr', [
    buildStudyCitation(data, title, version),
    buildStudyInfo(data, version),
    buildMethod(data, version),
    buildAccess(data),
    buildRelatedMaterials(data),
  ]);

  const nodes: XmlNode[] = compact([
    buildDocDescription(data, title),
    standardStudyDescription,
    ...buildFileDescriptions(data, version),
  ]);

  const namespace = DDI_NAMESPACES[version];
  const schemaUrl = DDI_SCHEMA_URLS[version];

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<codeBook xmlns="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${namespace} ${schemaUrl}" version="${version}">`,
    ...nodes.map((node) => renderNode(node, 1)),
    '</codeBook>',
    '',
  ];

  return lines.join('\n');
}
