/**
 * DDI Lifecycle 3.3 (XML) export.
 *
 * The builder mirrors the schema sequence of every container it emits. All
 * source keys and element names come from `data/ddi-lifecycle-mapping.json`
 * through `lib/ddiLifecycleMapping.ts`; the code below only decides how the
 * normalised study model is arranged in the Lifecycle structure.
 */

import {
  XmlAttrs,
  XmlNode,
  branch,
  leaf,
  renderNode,
} from './ddiXml';
import {
  LifecycleDateRange,
  LifecycleGenerationOptions,
  LifecyclePerson,
  LifecycleStudy,
  buildLifecycleStudy,
  cogsDateValue,
  lifecycleObjectId,
  lifecycleUrn,
} from './ddiLifecycle';
import {
  lifecycleElement,
  lifecycleLabel,
  lifecycleVersionConfig,
  lifecycleVocabulary,
} from './ddiLifecycleMapping';

const VERSION = '3.3' as const;

function element(name: string): string {
  return lifecycleElement(VERSION, name);
}

function studyUrn(study: LifecycleStudy, suffix?: string, index?: number): string {
  const id =
    suffix === undefined
      ? study.id
      : lifecycleObjectId(study, suffix, index);
  return lifecycleUrn(study, id);
}

function identification(
  study: LifecycleStudy,
  suffix?: string,
  index?: number
): XmlNode {
  return { name: element('urn'), text: studyUrn(study, suffix, index) };
}

function stringNode(value: string, study: LifecycleStudy): XmlNode | null {
  return leaf(element('string'), value, { 'xml:lang': study.language });
}

function internationalString(
  name: string,
  value: string | undefined,
  study: LifecycleStudy
): XmlNode | null {
  const text = stringNode(value ?? '', study);
  return text ? branch(name, [text]) : null;
}

function nameNode(
  name: string,
  value: string | undefined,
  study: LifecycleStudy
): XmlNode | null {
  return internationalString(name, value, study);
}

function contentNode(name: string, value: string | undefined): XmlNode | null {
  return value
    ? branch(name, [leaf(element('content'), value)])
    : null;
}

function codeValue(
  name: string,
  value: string | undefined,
  vocabularyKey?: string
): XmlNode | null {
  const vocabulary = vocabularyKey
    ? lifecycleVocabulary(vocabularyKey)
    : '';
  return leaf(name, value, {
    controlledVocabularyURN: vocabulary || undefined,
  });
}

function creatorNode(
  study: LifecycleStudy,
  person: LifecyclePerson
): XmlNode {
  return branch(element('creator'), [
    branch(element('creatorName'), [
      stringNode(person.name, study),
    ], { affiliation: person.affiliation || undefined }),
  ]) as XmlNode;
}

function contributorNode(
  study: LifecycleStudy,
  person: LifecyclePerson
): XmlNode {
  return branch(element('contributor'), [
    branch(element('contributorName'), [
      stringNode(person.name, study),
    ], { affiliation: person.affiliation || undefined }),
    person.role ? leaf(element('contributorRole'), person.role) : null,
  ]) as XmlNode;
}

function dateNode(
  name: string,
  range: LifecycleDateRange
): XmlNode | null {
  const simple = cogsDateValue(range.simple);
  const start = cogsDateValue(range.start);
  const end = cogsDateValue(range.end);
  // DDI 3.3 `r:Cycle` is an integer; stored values may use the same field as
  // a free-text label, which must not be written as a cycle number.
  const cycle = /^\d+$/.test(range.cycle ?? '') ? range.cycle : undefined;

  if (simple) return branch(name, [leaf(element('simpleDate'), simple)]);
  if (start && end) {
    return branch(name, [
      leaf(element('startDate'), start),
      leaf(element('endDate'), end),
      leaf('r:Cycle', cycle),
    ]);
  }
  if (start) {
    return branch(name, [
      leaf(element('startDate'), start),
      leaf('r:Cycle', cycle),
    ]);
  }
  if (end) {
    return branch(name, [
      leaf(element('endDate'), end),
      leaf('r:Cycle', cycle),
    ]);
  }
  return null;
}

function citationNode(study: LifecycleStudy): XmlNode {
  const creators = [
    ...study.authors.map((person) => creatorNode(study, person)),
    ...study.referents.map((name) =>
      creatorNode(study, {
        name,
        role: lifecycleLabel('referentRole', 'Ingénieur référent'),
      })
    ),
    ...study.metadataTeam.map((person) =>
      creatorNode(study, {
        ...person,
        role:
          person.role ||
          lifecycleLabel('metadataTeamRole', 'Production des métadonnées'),
      })
    ),
  ];

  const publishers = [
    ...study.producers.map((person) =>
      branch(element('publisher'), [
        branch(element('publisherName'), [
          stringNode(person.name, study),
        ]),
        leaf(
          element('publisherRole'),
          person.role || lifecycleLabel('producerRole', 'Producteur')
        ),
      ])
    ),
    ...study.distributors.map((distributor) =>
      branch(element('publisher'), [
        branch(element('publisherName'), [
          stringNode(distributor.name, study),
        ], { affiliation: distributor.affiliation || undefined }),
        leaf(
          element('publisherRole'),
          distributor.abbr ||
            distributor.localId ||
            lifecycleLabel('distributorRole', 'Diffuseur')
        ),
      ])
    ),
  ];

  const contributors = study.contributors.map((person) =>
    contributorNode(study, person)
  );

  const doi = study.doi
    ? branch(element('internationalIdentifier'), [
        leaf(element('identifierContent'), study.doi),
        leaf(element('managingAgency'), 'DOI'),
      ])
    : null;

  return branch(element('citation'), [
    internationalString(element('title'), study.title, study),
    internationalString(element('subTitle'), study.subtitle, study),
    internationalString(
      element('alternateTitle'),
      study.alternateTitle,
      study
    ),
    internationalString(
      element('alternateTitle'),
      study.parallelTitle,
      study
    ),
    ...creators,
    ...publishers,
    ...contributors,
    study.publicationDate
      ? dateNode(element('publicationDate'), {
          simple: study.publicationDate,
        })
      : null,
    leaf(element('language'), study.language),
    doi,
  ]) as XmlNode;
}

function coverageNode(
  study: LifecycleStudy,
  suffix: string
): XmlNode | null {
  const subjects = [...study.inedTopics, ...study.cessdaTopics];
  const hasTopical =
    subjects.length > 0 || study.keywords.length > 0;
  const hasSpatial =
    Boolean(study.geographicCoverage) || study.countries.length > 0;
  const hasTemporal = study.timePeriods.length > 0;

  if (!hasTopical && !hasSpatial && !hasTemporal) return null;

  const topical = hasTopical
    ? branch(element('topicalCoverage'), [
        identification(study, `${suffix}topic`),
        ...subjects.map((subject) =>
          leaf(element('subject'), subject, { 'xml:lang': study.language })
        ),
        ...study.keywords.map((keyword) =>
          leaf(element('keyword'), keyword.value, {
            'xml:lang': study.language,
            controlledVocabularyURN: keyword.vocabularyUri || undefined,
          })
        ),
      ])
    : null;

  const spatialDescription = [
    study.geographicCoverage,
    study.countries.length > 0
      ? `Pays : ${study.countries.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const spatial = hasSpatial
    ? branch(element('spatialCoverage'), [
        identification(study, `${suffix}space`),
        contentNode(element('description'), spatialDescription),
        ...study.countries
          .filter((country) => /^[A-Z]{2,3}$|^\d{3}$/.test(country))
          .map((country) => leaf(element('countryCode'), country)),
      ])
    : null;

  const temporal = hasTemporal
    ? branch(element('temporalCoverage'), [
        identification(study, `${suffix}time`),
        ...study.timePeriods.map((range) =>
          dateNode(element('referenceDate'), range)
        ),
      ])
    : null;

  return branch(element('coverage'), [topical, spatial, temporal]);
}

function fundingNodes(study: LifecycleStudy): XmlNode[] {
  return study.funders.map((funder) =>
    branch(element('fundingInformation'), [
      leaf(element('funderRole'), funder.role),
      leaf(element('grantNumber'), funder.grant),
      contentNode(element('description'), funder.name),
    ])
  ).filter((node): node is XmlNode => Boolean(node));
}

function otherMaterialSchemeNode(study: LifecycleStudy): XmlNode | null {
  if (study.materials.length === 0) return null;

  const materials = study.materials.map((material, index) =>
    branch(element('otherMaterial'), [
      identification(study, 'material', index),
      codeValue(element('typeOfMaterial'), material.type),
      contentNode(element('description'), material.description),
      branch(element('citation'), [
        internationalString(element('title'), material.name, study),
      ]),
      material.url ? leaf(element('externalUrl'), material.url) : null,
    ])
  );

  return branch(element('otherMaterialScheme'), [
    identification(study, 'materials'),
    nameNode(
      element('otherMaterialSchemeName'),
      lifecycleLabel('otherMaterialSchemeName', 'Ressources associées'),
      study
    ),
    ...materials,
  ]);
}

function universeNode(study: LifecycleStudy): XmlNode {
  const geography = [
    study.geographicCoverage,
    study.countries.join(', '),
  ]
    .filter(Boolean)
    .join(' — ');

  return branch(element('universe'), [
    identification(study, 'universe'),
    nameNode(
      element('universeName'),
      lifecycleLabel('universeName', "Univers de l'étude"),
      study
    ),
    contentNode(element('description'), study.universe),
    contentNode(element('geographyOfUniverse'), geography),
    ...study.timePeriods.map((range) =>
      dateNode(element('timePeriod'), range)
    ),
  ]) as XmlNode;
}

function conceptualComponentNode(study: LifecycleStudy): XmlNode {
  return branch(element('conceptualComponent'), [
    identification(study, 'conceptual'),
    nameNode(
      element('conceptualComponentName'),
      lifecycleLabel('conceptualComponentName', 'Composantes conceptuelles'),
      study
    ),
    branch(element('universeScheme'), [
      identification(study, 'universes'),
      nameNode(
        element('universeSchemeName'),
        lifecycleLabel('universeSchemeName', 'Univers'),
        study
      ),
      universeNode(study),
    ]),
  ]) as XmlNode;
}

function methodologyNode(study: LifecycleStudy): XmlNode | null {
  const timeMethods = study.timeMethods.map((method, index) =>
    branch(element('timeMethod'), [
      identification(study, 'timemethod', index),
      codeValue(element('typeOfTimeMethod'), method, 'timeMethod'),
    ])
  );

  const sampling = study.samplingProcedures.map((procedure, index) =>
    branch(element('samplingProcedure'), [
      identification(study, 'sampling', index),
      codeValue(
        element('typeOfSamplingProcedure'),
        procedure,
        'samplingProcedure'
      ),
      contentNode(
        element('description'),
        index === 0 ? study.samplingDetail : undefined
      ),
    ])
  );

  const treatment = [
    study.weighting ? `Pondérations : ${study.weighting}` : '',
    study.cleaning ? `Apurement : ${study.cleaning}` : '',
    study.dataQuality
      ? `Qualité des données : ${study.dataQuality}`
      : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const treatmentNode = treatment
    ? branch(element('dataCollectionMethodology'), [
        identification(study, 'treatment'),
        contentNode(element('description'), treatment),
      ])
    : null;

  if (
    timeMethods.length === 0 &&
    sampling.length === 0 &&
    !treatmentNode
  ) {
    return null;
  }

  return branch(element('methodology'), [
    identification(study, 'methodology'),
    nameNode(
      element('methodologyName'),
      lifecycleLabel('methodologyName', 'Méthodologie de collecte'),
      study
    ),
    treatmentNode,
    ...timeMethods,
    ...sampling,
  ]);
}

function collectionEventDescription(study: LifecycleStudy): string {
  const collectors = study.dataCollectors
    .map((collector) =>
      [collector.name, collector.abbr].filter(Boolean).join(' ')
    )
    .join('; ');

  return [
    collectors ? `Responsable(s) de la collecte : ${collectors}` : '',
    study.collectionSituation
      ? `Situation de collecte : ${study.collectionSituation}`
      : '',
    study.frequency ? `Fréquence : ${study.frequency}` : '',
    study.instrumentDetail
      ? `Instrument : ${study.instrumentDetail}`
      : '',
    study.responseRate ? `Taux de réponse : ${study.responseRate}` : '',
  ]
    .filter(Boolean)
    .join(' — ');
}

function collectionEvents(study: LifecycleStudy): XmlNode[] {
  const ranges: LifecycleDateRange[] =
    study.collectionDates.length > 0 ? study.collectionDates : [{}];

  return ranges.map((range, index) => {
    const modes = study.collectionModes.map((mode, modeIndex) =>
      branch(element('modeOfCollection'), [
        identification(study, `mode${index + 1}_${modeIndex + 1}`),
        codeValue(
          element('typeOfModeOfCollection'),
          mode,
          'modeOfCollection'
        ),
        contentNode(
          element('description'),
          modeIndex === 0 ? study.collectionModeDetail : undefined
        ),
      ])
    );

    const situation = study.collectionSituation
      ? branch(element('collectionSituation'), [
          identification(study, 'situation', index),
          contentNode(
            element('description'),
            study.collectionSituation
          ),
        ])
      : null;

    const losses = study.cleaning
      ? branch(element('actionToMinimizeLosses'), [
          identification(study, 'losses', index),
          contentNode(element('description'), study.cleaning),
        ])
      : null;

    return branch(element('collectionEvent'), [
      identification(study, 'event', index),
      nameNode(
        element('collectionEventName'),
        ranges.length > 1
          ? `${lifecycleLabel(
              'collectionEventName',
              'Événement de collecte'
            )} ${index + 1}`
          : lifecycleLabel('collectionEventName', 'Événement de collecte'),
        study
      ),
      contentNode(
        element('description'),
        collectionEventDescription(study)
      ),
      dateNode(element('dataCollectionDate'), range),
      ...modes,
      situation,
      losses,
    ]);
  }).filter((node): node is XmlNode => Boolean(node));
}

function dataCollectionNode(study: LifecycleStudy): XmlNode {
  return branch(element('dataCollection'), [
    identification(study, 'datacollection'),
    nameNode(
      element('dataCollectionModuleName'),
      lifecycleLabel('dataCollectionName', 'Collecte des données'),
      study
    ),
    methodologyNode(study),
    ...collectionEvents(study),
  ]) as XmlNode;
}

function studyUnitNode(study: LifecycleStudy): XmlNode {
  const units = study.analysisUnits.map((unit) =>
    codeValue(element('analysisUnit'), unit, 'analysisUnit')
  );

  const kinds = study.kindsOfData.map((kind) =>
    codeValue(element('kindOfData'), kind, 'kindOfData')
  );

  return branch(element('studyUnit'), [
    identification(study, 'studyunit'),
    codeValue(
      element('typeOfStudyUnit'),
      lifecycleLabel('studyUnitType', 'Étude')
    ),
    citationNode(study),
    contentNode(element('abstract'), study.abstract),
    branch(element('universeReference'), [
      leaf(element('urn'), studyUrn(study, 'universe')),
      leaf(element('typeOfObject'), 'Universe'),
    ]),
    ...fundingNodes(study),
    coverageNode(study, 'study'),
    ...units,
    ...kinds,
    otherMaterialSchemeNode(study),
    conceptualComponentNode(study),
    dataCollectionNode(study),
  ]) as XmlNode;
}

function rootAttributes(study: LifecycleStudy): XmlAttrs {
  const config = lifecycleVersionConfig(VERSION);
  const attrs: XmlAttrs = {};

  for (const [prefix, uri] of Object.entries(config.prefixes ?? {})) {
    attrs[`xmlns:${prefix}`] = uri;
  }

  attrs['xsi:schemaLocation'] = config.schemaLocation;
  return attrs;
}

/** Convert stored survey JSON into a DDI Lifecycle 3.3 XML document. */
export function generateDdiLifecycle33(
  data: Record<string, unknown>,
  options: LifecycleGenerationOptions = {}
): string {
  const study = buildLifecycleStudy(data, options);
  const config = lifecycleVersionConfig(VERSION);

  const instance = branch(config.root, [
    identification(study, 'instance'),
    citationNode(study),
    coverageNode(study, 'instance'),
    studyUnitNode(study),
  ]) as XmlNode;

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    renderNode({ ...instance, attrs: rootAttributes(study) }),
    '',
  ];

  return lines.join('\n');
}
