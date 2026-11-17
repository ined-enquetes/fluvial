/**
 * DDI Lifecycle 4.0 (JSON) export.
 *
 * DDI 4 publishes a JSON document made of a `topLevelReferences` list and an
 * `items` list. Every item carries `$type` plus its DDI identification, and
 * containers point at each other with `Reference` objects. The builder reads
 * property names, labels and vocabulary URIs from the parametric mapping
 * file, then serialises the shared study model.
 */

import {
  LifecycleDateRange,
  LifecycleGenerationOptions,
  LifecyclePerson,
  LifecycleStudy,
  buildLifecycleStudy,
  lifecycleObjectId,
  lifecycleUrn,
  toCogsDate,
} from './ddiLifecycle';
import {
  lifecycleElement,
  lifecycleLabel,
  lifecycleVocabulary,
} from './ddiLifecycleMapping';

const VERSION = '4.0' as const;

type JsonObject = Record<string, unknown>;

function property(name: string): string {
  return lifecycleElement(VERSION, name);
}

function langString(value: string, language: string): JsonObject {
  return { '@language': language, '@value': value };
}

function langStrings(
  value: string | undefined,
  language: string
): JsonObject[] | undefined {
  return value ? [langString(value, language)] : undefined;
}

function codeValue(value: string, vocabularyKey?: string): JsonObject {
  const vocabulary = vocabularyKey
    ? lifecycleVocabulary(vocabularyKey)
    : '';
  return {
    StringValue: value,
    ...(vocabulary ? { ControlledVocabularyURI: vocabulary } : {}),
  };
}

function identifier(
  study: LifecycleStudy,
  suffix?: string,
  index?: number
): JsonObject {
  const id =
    suffix === undefined
      ? study.id
      : lifecycleObjectId(study, suffix, index);

  return {
    URN: lifecycleUrn(study, id),
    Agency: study.agency,
    ID: id,
    Version: study.version,
  };
}

function reference(
  study: LifecycleStudy,
  type: string,
  suffix: string
): JsonObject {
  return referenceAt(study, type, suffix);
}

function referenceAt(
  study: LifecycleStudy,
  type: string,
  suffix: string,
  index?: number
): JsonObject {
  return {
    $type: type,
    ...identifier(study, suffix, index),
  };
}

function bibliographicName(person: LifecyclePerson, study: LifecycleStudy): JsonObject {
  return {
    Name: langStrings(person.name, study.language) ?? [],
    ...(person.affiliation ? { Affiliation: person.affiliation } : {}),
  };
}

function dateType(range: LifecycleDateRange): JsonObject | undefined {
  const simple = toCogsDate(range.simple);
  const start = toCogsDate(range.start);
  const end = toCogsDate(range.end);
  const cycle = /^\d+$/.test(range.cycle ?? '')
    ? Number(range.cycle)
    : undefined;

  if (simple) return { SimpleDate: simple };
  if (start && end) {
    return {
      StartDate: start,
      EndDate: end,
      ...(cycle === undefined ? {} : { Cycle: cycle }),
    };
  }
  if (start) {
    return {
      StartDate: start,
      ...(cycle === undefined ? {} : { Cycle: cycle }),
    };
  }
  if (end) {
    return {
      EndDate: end,
      ...(cycle === undefined ? {} : { Cycle: cycle }),
    };
  }
  return undefined;
}

function citation(study: LifecycleStudy): JsonObject {
  const creators = study.authors.map((person) => ({
    CreatorName: bibliographicName(person, study),
  }));

  const publishers = [
    ...study.producers.map((person) => ({
      PublisherName: bibliographicName(person, study),
      PublisherRole: [
        codeValue(
          person.role || lifecycleLabel('producerRole', 'Producteur')
        ),
      ],
    })),
    ...study.distributors.map((distributor) => ({
      PublisherName: bibliographicName(distributor, study),
      PublisherRole: [
        codeValue(
          distributor.abbr ||
            distributor.localId ||
            lifecycleLabel('distributorRole', 'Diffuseur')
        ),
      ],
    })),
  ];

  const contributors = [
    ...study.contributors.map((person) => ({
      ContributorName: bibliographicName(person, study),
      ...(person.role
        ? { ContributorRole: [codeValue(person.role)] }
        : {}),
    })),
    ...study.referents.map((name) => ({
      ContributorName: bibliographicName({ name }, study),
      ContributorRole: [
        codeValue(
          lifecycleLabel('referentRole', 'Ingénieur référent')
        ),
      ],
    })),
    ...study.metadataTeam.map((person) => ({
      ContributorName: bibliographicName(person, study),
      ContributorRole: [
        codeValue(
          person.role ||
            lifecycleLabel(
              'metadataTeamRole',
              'Production des métadonnées'
            )
        ),
      ],
    })),
  ];

  const publicationDate = study.publicationDate
    ? dateType({ simple: study.publicationDate })
    : undefined;

  return {
    Title: langStrings(study.title, study.language) ?? [],
    ...(study.subtitle
      ? { SubTitle: langStrings(study.subtitle, study.language) }
      : {}),
    ...(study.alternateTitle || study.parallelTitle
      ? {
          AlternateTitle: [
            ...(langStrings(study.alternateTitle, study.language) ?? []),
            ...(langStrings(study.parallelTitle, study.language) ?? []),
          ],
        }
      : {}),
    ...(creators.length > 0 ? { Creator: creators } : {}),
    ...(publishers.length > 0 ? { Publisher: publishers } : {}),
    ...(contributors.length > 0 ? { Contributor: contributors } : {}),
    ...(publicationDate ? { PublicationDate: publicationDate } : {}),
    Language: [codeValue(study.language)],
    ...(study.doi
      ? {
          InternationalIdentifier: [
            {
              IdentifierContent: study.doi,
              ManagingAgency: codeValue('DOI'),
            },
          ],
        }
      : {}),
  };
}

function coverage(
  study: LifecycleStudy,
  prefix: string
): JsonObject | undefined {
  const subjects = [...study.inedTopics, ...study.cessdaTopics];

  const topical =
    subjects.length > 0 || study.keywords.length > 0
      ? {
          ...identifier(study, `${prefix}topic`),
          ...(subjects.length > 0
            ? {
                Subject: subjects.map((subject) => ({
                  MultilingualStringValue: langString(
                    subject,
                    study.language
                  ),
                })),
              }
            : {}),
          ...(study.keywords.length > 0
            ? {
                Keyword: study.keywords.map((keyword) => ({
                  MultilingualStringValue: langString(
                    keyword.value,
                    study.language
                  ),
                  ...(keyword.vocabularyUri
                    ? {
                        ControlledVocabularyURN:
                          keyword.vocabularyUri,
                      }
                    : {}),
                })),
              }
            : {}),
        }
      : undefined;

  const spatialDescription = [
    study.geographicCoverage,
    study.countries.length > 0
      ? `Pays : ${study.countries.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const isoCountries = study.countries.filter((country) =>
    /^[A-Z]{2,3}$|^\d{3}$/.test(country)
  );

  const spatial =
    spatialDescription || isoCountries.length > 0
      ? {
          ...identifier(study, `${prefix}space`),
          ...(spatialDescription
            ? {
                Description: langStrings(
                  spatialDescription,
                  study.language
                ),
              }
            : {}),
          ...(isoCountries.length > 0
            ? {
                CountryCode: isoCountries.map((country) => ({
                  StringValue: country,
                })),
              }
            : {}),
        }
      : undefined;

  const temporal =
    study.timePeriods.length > 0
      ? {
          ...identifier(study, `${prefix}time`),
          ReferenceDate: study.timePeriods
            .map((range) => dateType(range))
            .filter((value): value is JsonObject => Boolean(value)),
        }
      : undefined;

  if (!topical && !spatial && !temporal) return undefined;

  return {
    ...(topical ? { TopicalCoverage: topical } : {}),
    ...(spatial ? { SpatialCoverage: spatial } : {}),
    ...(temporal ? { TemporalCoverage: temporal } : {}),
  };
}

function fundingInformation(study: LifecycleStudy): JsonObject[] | undefined {
  if (study.funders.length === 0) return undefined;

  return study.funders.map((funder) => ({
    Description: langStrings(funder.name, study.language),
    ...(funder.role ? { FunderRole: codeValue(funder.role) } : {}),
    ...(funder.grant ? { GrantNumber: [funder.grant] } : {}),
  }));
}

function otherMaterials(study: LifecycleStudy): JsonObject[] {
  return study.materials.map((material, index) => ({
    $type: 'OtherMaterial',
    ...identifier(study, 'material', index),
    TypeOfMaterial: codeValue(material.type),
    ...(material.description
      ? {
          Description: langStrings(
            material.description,
            study.language
          ),
        }
      : {}),
    Citation: {
      Title:
        langStrings(material.name, study.language) ?? [],
    },
    ...(material.url
      ? { ExternalURLReference: [material.url] }
      : {}),
  }));
}

function otherMaterialScheme(study: LifecycleStudy): JsonObject | undefined {
  if (study.materials.length === 0) return undefined;

  return {
    $type: 'OtherMaterialScheme',
    ...identifier(study, 'materials'),
    OtherMaterialSchemeName:
      langStrings(
        lifecycleLabel(
          'otherMaterialSchemeName',
          'Ressources associées'
        ),
        study.language
      ) ?? [],
    OtherMaterialReference: study.materials.map((_, index) =>
      referenceAt(study, 'OtherMaterial', 'material', index)
    ),
  };
}

function universe(study: LifecycleStudy): JsonObject {
  const geography = [
    study.geographicCoverage,
    study.countries.join(', '),
  ]
    .filter(Boolean)
    .join(' — ');

  const periods = study.timePeriods
    .map((range) => dateType(range))
    .filter((value): value is JsonObject => Boolean(value));

  return {
    $type: 'Universe',
    ...identifier(study, 'universe'),
    UniverseName:
      langStrings(
        lifecycleLabel('universeName', "Univers de l'étude"),
        study.language
      ) ?? [],
    ...(study.universe
      ? { Description: langStrings(study.universe, study.language) }
      : {}),
    ...(geography
      ? {
          GeographyOfUniverse: langStrings(
            geography,
            study.language
          ),
        }
      : {}),
    ...(periods.length > 0 ? { TimePeriod: periods } : {}),
  };
}

function methodology(study: LifecycleStudy): JsonObject | undefined {
  const timeMethods = study.timeMethods.map((method, index) => ({
    ...identifier(study, 'timemethod', index),
    TypeOfTimeMethod: codeValue(method, 'timeMethod'),
  }));

  const sampling = study.samplingProcedures.map((procedure, index) => ({
    ...identifier(study, 'sampling', index),
    TypeOfSamplingProcedure: codeValue(
      procedure,
      'samplingProcedure'
    ),
    ...(index === 0 && study.samplingDetail
      ? {
          Description: langStrings(
            study.samplingDetail,
            study.language
          ),
        }
      : {}),
  }));

  const treatment = [
    study.weighting ? `Pondérations : ${study.weighting}` : '',
    study.cleaning ? `Apurement : ${study.cleaning}` : '',
    study.dataQuality
      ? `Qualité des données : ${study.dataQuality}`
      : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const treatmentNode =
    treatment.length > 0
      ? {
          ...identifier(study, 'treatment'),
          Description: langStrings(treatment, study.language),
        }
      : undefined;

  if (
    timeMethods.length === 0 &&
    sampling.length === 0 &&
    !treatmentNode
  ) {
    return undefined;
  }

  return {
    $type: 'Methodology',
    ...identifier(study, 'methodology'),
    MethodologyName:
      langStrings(
        lifecycleLabel('methodologyName', 'Méthodologie de collecte'),
        study.language
      ) ?? [],
    ...(treatmentNode
      ? { DataCollectionMethodology: [treatmentNode] }
      : {}),
    ...(timeMethods.length > 0 ? { TimeMethod: timeMethods } : {}),
    ...(sampling.length > 0 ? { SamplingProcedure: sampling } : {}),
  };
}

function collectionEvents(study: LifecycleStudy): JsonObject[] {
  const ranges: LifecycleDateRange[] =
    study.collectionDates.length > 0 ? study.collectionDates : [{}];

  const collectors = study.dataCollectors
    .map((collector) =>
      [collector.name, collector.abbr].filter(Boolean).join(' ')
    )
    .join('; ');

  const description = [
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

  return ranges.map((range, index) => {
    const modes = study.collectionModes.map((mode, modeIndex) => ({
      ...identifier(
        study,
        `mode${index + 1}_${modeIndex + 1}`
      ),
      TypeOfModeOfCollection: codeValue(
        mode,
        'modeOfCollection'
      ),
      ...(modeIndex === 0 && study.collectionModeDetail
        ? {
            Description: langStrings(
              study.collectionModeDetail,
              study.language
            ),
          }
        : {}),
    }));

    const situation = study.collectionSituation
      ? [
          {
            ...identifier(study, 'situation', index),
            Description: langStrings(
              study.collectionSituation,
              study.language
            ),
          },
        ]
      : undefined;

    const losses = study.cleaning
      ? [
          {
            ...identifier(study, 'losses', index),
            Description: langStrings(
              study.cleaning,
              study.language
            ),
          },
        ]
      : undefined;

    const date = dateType(range);

    return {
      ...identifier(study, 'event', index),
      CollectionEventName:
        langStrings(
          ranges.length > 1
            ? `${lifecycleLabel(
                'collectionEventName',
                'Événement de collecte'
              )} ${index + 1}`
            : lifecycleLabel(
                'collectionEventName',
                'Événement de collecte'
              ),
          study.language
        ) ?? [],
      ...(description
        ? { Description: langStrings(description, study.language) }
        : {}),
      ...(date ? { DataCollectionDate: date } : {}),
      ...(modes.length > 0 ? { ModeOfCollection: modes } : {}),
      ...(situation ? { CollectionSituation: situation } : {}),
      ...(losses ? { ActionToMinimizeLosses: losses } : {}),
    };
  });
}

function dataCollection(study: LifecycleStudy): JsonObject {
  return {
    $type: 'DataCollection',
    ...identifier(study, 'datacollection'),
    DataCollectionModuleName:
      langStrings(
        lifecycleLabel('dataCollectionName', 'Collecte des données'),
        study.language
      ) ?? [],
    ...(methodology(study)
      ? {
          MethodologyReference: reference(
            study,
            'Methodology',
            'methodology'
          ),
        }
      : {}),
    CollectionEvent: collectionEvents(study),
  };
}

function studyUnit(study: LifecycleStudy): JsonObject {
  const units = study.analysisUnits.map((unit) =>
    codeValue(unit, 'analysisUnit')
  );
  const kinds = study.kindsOfData.map((kind) =>
    codeValue(kind, 'kindOfData')
  );
  const materialScheme = otherMaterialScheme(study);

  return {
    $type: 'StudyUnit',
    ...identifier(study, 'studyunit'),
    Lang: study.language,
    TypeOfStudyUnit: codeValue(
      lifecycleLabel('studyUnitType', 'Étude')
    ),
    Citation: citation(study),
    ...(study.abstract
      ? { Abstract: langStrings(study.abstract, study.language) }
      : {}),
    ...(fundingInformation(study)
      ? { FundingInformation: fundingInformation(study) }
      : {}),
    ...(coverage(study, 'study')
      ? { Coverage: coverage(study, 'study') }
      : {}),
    ...(units.length > 0 ? { AnalysisUnit: units } : {}),
    ...(kinds.length > 0 ? { KindOfData: kinds } : {}),
    UniverseReference: reference(study, 'Universe', 'universe'),
    DataCollectionReference: [
      reference(study, 'DataCollection', 'datacollection'),
    ],
    ...(materialScheme
      ? {
          OtherMaterialSchemeReference: [
            reference(study, 'OtherMaterialScheme', 'materials'),
          ],
        }
      : {}),
  };
}

function instance(study: LifecycleStudy): JsonObject {
  return {
    $type: 'DDIInstance',
    ...identifier(study, 'instance'),
    Lang: study.language,
    Citation: citation(study),
    ...(coverage(study, 'instance')
      ? { Coverage: coverage(study, 'instance') }
      : {}),
    StudyUnitReference: [
      reference(study, 'StudyUnit', 'studyunit'),
    ],
  };
}

/** Convert stored survey JSON into a DDI Lifecycle 4.0 JSON document. */
export function generateDdiLifecycle40(
  data: Record<string, unknown>,
  options: LifecycleGenerationOptions = {}
): string {
  const study = buildLifecycleStudy(data, options);
  const root = instance(study);

  const document = {
    topLevelReferences: [
      {
        $type: property('root'),
        ...identifier(study, 'instance'),
      },
    ],
    items: [
      root,
      studyUnit(study),
      dataCollection(study),
      ...(methodology(study) ? [methodology(study)] : []),
      universe(study),
      ...(otherMaterialScheme(study)
        ? [otherMaterialScheme(study)]
        : []),
      ...otherMaterials(study),
    ],
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}
