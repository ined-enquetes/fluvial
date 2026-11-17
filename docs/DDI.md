# DDI in FLUVIAL

**English** · [Français](DDI.fr.md)

This document explains how FLUVIAL produces and consumes DDI. It covers DDI
Codebook XML (2.6, 2.5, 2.1), the export-only DDI Lifecycle formats (3.3 XML and
4.0 JSON), how the field registry works, and how to add a new metadata field
without breaking the DDI output.

## Overview

FLUVIAL stores survey metadata as a **flat JSON object** in
`data/responses/<survey-token>/responses.json`. Each key is the `name` of a
SurveyJS question declared in `data/survey-template.json`.

DDI files are **generated on demand** from that JSON. The JSON storage format
does not change when exporting. Import works in the opposite direction for DDI
Codebook: a Codebook file is parsed and mapped back to the same flat JSON shape,
replacing the instance's metadata. DDI Lifecycle 3.3 and 4.0 are export-only.

The DDI Alliance schemas are **not downloaded or read at runtime**. Schema URLs
are only written into the XML/JSON metadata and linked from the admin UI. They
are used during development to check that the generated files are valid.

## Files

| File | Role |
| --- | --- |
| `lib/ddiXml.ts` | XML node primitives and rendering (`leaf`, `branch`, `renderNode`, text helpers). |
| `lib/ddiMapping.ts` | Declarative registry for simple fields, plus `mappedNodes()` used by export. |
| `lib/ddi.ts` | DDI Codebook 2.6 / 2.5 / 2.1 generator and hand-written builders for complex sections. |
| `lib/ddiLifecycleMapping.ts` | Typed loader for the parametric Lifecycle conversion table. |
| `lib/ddiLifecycle.ts` | Normalised study model shared by the Lifecycle builders. |
| `lib/ddiLifecycle33.ts` | DDI Lifecycle 3.3 XML generator. |
| `lib/ddiLifecycle40.ts` | DDI Lifecycle 4.0 JSON generator. |
| `lib/ddiImport.ts` | DDI parser and reverse mapper, including registry import. |
| `app/api/survey/[token]/export/ddi/route.ts` | Admin-protected export endpoint. |
| `app/api/survey/[token]/import/ddi/route.ts` | Admin-protected import endpoint. |
| `app/admin/page.tsx` | Version selector, documentation links, export and import buttons. |
| `data/survey-template.json` | SurveyJS questionnaire; question `name`s become JSON keys. |
| `data/ddi-lifecycle-mapping.json` | Parametric conversion table for DDI Lifecycle 3.3 / 4.0. |
| `data/responses/<token>/responses.json` | Stored metadata for one survey instance. |

## Export flow

```
responses.json
    │  flat JSON: { idno, titl, nation: [...], timePrd: [...], ... }
    ▼
lib/ddiLifecycle.ts          lib/ddi.ts
    │  normalised study model    ├── buildTitleStatement / buildStudyCitation
    │                            ├── buildMethod / buildAccess
    │                            ├── buildFileDescriptions
    │                            └── mappedNodes(...)  ← lib/ddiMapping.ts
    ├── lib/ddiLifecycle33.ts ──► DDI Lifecycle 3.3 XML
    └── lib/ddiLifecycle40.ts ──► DDI Lifecycle 4.0 JSON

lib/ddi.ts ──► DDI Codebook 2.6, 2.5 or 2.1 XML
```

The admin UI calls:

```http
GET /api/survey/<instanceId>/export/ddi?version=2.6
Authorization: Bearer <adminToken>
```

The route loads the instance by `id`, loads its responses by `token`, calls the
selected generator, and returns the file as an attachment. Accepted versions are
`2.6` (default), `2.5`, `2.1`, `3.3` and `4.0`. Codebook and Lifecycle 3.3
return `application/xml`; Lifecycle 4.0 returns `application/json`.

## Import flow

```
DDI XML
    ▼
lib/ddiImport.ts
    ├── SyntaxValidator (fast-xml-validator, reject malformed XML)
    ├── reject DTD, enforce 10 MB limit
    ├── detect version from @version / namespace
    ├── map known elements back to flat JSON
    └── applyMappedFields(...)  ← simple fields from lib/ddiMapping.ts
    ▼
responses.json (metadata replaced; logoFile preserved)
```

The admin UI calls:

```http
POST /api/survey/<instanceId>/import/ddi
Authorization: Bearer <adminToken>
Content-Type: application/xml

<codeBook ...>...</codeBook>
```

Import is **best-effort**. DDI cannot represent every FLUVIAL-specific value
(see [Round-trip limitations](#round-trip-limitations)).

## The field registry

`lib/ddiMapping.ts` contains `DDI_FIELD_MAPPINGS`, an ordered array of simple
field mappings. The same entries are used by export (`mappedNodes`) and import
(`applyMappedFields`), so a simple scalar or list field is declared once.

### Entry anatomy

```ts
interface DdiFieldMapping {
  key: string;              // JSON key / SurveyJS question name
  element: string;          // DDI element name
  parent: string;           // parent path from <codeBook>
  kind?: 'text' | 'list';   // default: text
  sourceKeys?: string[];    // JSON keys to try, default: [key]
  itemKeys?: string[];      // keys to read when list items are objects
  attrs?: Record<string, string>; // static XML attributes
  numeric?: boolean;        // convert numeric-looking list values on import
  singleAsScalar?: boolean; // one list value -> scalar, not a one-item array
  versions?: DdiVersion[];  // restrict to 2.6, 2.5 and/or 2.1
}
```

## Adding a simple field

The easiest case is a field whose DDI parent is already wired to the registry.
Example: add a free-text "Notes sur la collecte" question and export it as
`<method><notes>`.

### 1. Add the question to the questionnaire

In `data/survey-template.json`, in the relevant page:

```json
{
  "type": "comment",
  "name": "collNotes",
  "title": "Notes sur la collecte"
}
```

The `name` becomes the key in `responses.json`. Keep it stable: existing
responses are keyed by it.

### 2. Add one registry entry

In `lib/ddiMapping.ts`:

```ts
{
  key: 'collNotes',
  element: 'notes',
  parent: 'stdyDscr/method',
},
```

That is enough. `buildMethod()` already calls
`mappedNodes('stdyDscr/method', ...)` between `<dataColl>` and `<anlyInfo>`, and
`importDdiCodebook()` already calls `applyMappedFields()` for the same parent.

The export now contains:

```xml
<method>
  <dataColl>...</dataColl>
  <notes>Texte saisi dans le formulaire</notes>
  <anlyInfo>...</anlyInfo>
</method>
```

and import puts the text back into `data.collNotes`.

### 3. Optional: add a documentation chip

If the element is not already in `DDI_ELEMENT_NAMES` in
`app/admin/page.tsx`, add it so the admin UI links to its official
documentation.

### 4. Validate

See [Validation](#validation).

## Wired parents

These parent paths already have a `mappedNodes()` call on export and an
`applyMappedFields()` call on import. Adding an entry for one of them requires
only the registry entry.

| Parent path | Position in the XML | Current registry fields |
| --- | --- | --- |
| `stdyDscr/citation/titlStmt` | after `<titl>`, before `<IDNo>` | `subTitl`, `altTitl`, `parTitl` |
| `stdyDscr/stdyInfo/sumDscr` | after `<timePrd>` and `<collDate>` | `nation`, `geogCover`, `geogUnit`, `analyUnit`, `universe`, `dataKind` |
| `stdyDscr/method` | after `<dataColl>`, before `<anlyInfo>` | none yet (ready for notes-like fields, e.g. `collNotes`) |
| `stdyDscr/method/anlyInfo` | inside `<anlyInfo>` | `respRate`, `dataAppr` |

### Ordering rule

Entries for the same parent are emitted in array order. That order must match
the DDI schema sequence. For example, in `sumDscrType` the schema expects:

```text
timePrd, collDate, nation, geogCover, geogUnit, geoBndBox, boundPoly,
anlyUnit, universe, dataKind
```

A new `nation` entry must be placed next to the existing `nation` entry, not at
the end of the array. Putting it after `dataKind` produces well-formed but
schema-invalid XML.

### Adding a new parent

When the target section is not in the table above, wire it once:

1. In the matching builder in `lib/ddi.ts`, insert the registry call at the
   schema-correct position:

   ```ts
   branch('parentElement', [
     ...customNodes,
     ...mappedNodes('path/to/parent', data, version),
     ...otherNodes,
   ]);
   ```

2. In `lib/ddiImport.ts`, after resolving the parsed parent record, call:

   ```ts
   applyMappedFields(data, parentRecord, version, 'path/to/parent');
   ```

3. Add the registry entries.

After that, additional simple fields for that parent only need registry entries.

## Complex fields

The registry is intentionally limited to leaf elements whose value is a direct
JSON value or list. The following stay in hand-written code because they need
people, attributes from several JSON keys, repeated groups, or validation:

| Section | Where |
| --- | --- |
| Titles, ID numbers, DOI | `buildTitleStatement` / `buildStudyCitation` |
| Metadata team, authors, contributors, producers, funders, distributors | `buildDocDescription` / `buildStudyCitation` |
| Keywords and INED/CESSDA topics | `keywordNodes` / `topicClassNodes` |
| Time periods and collection dates with attributes | `buildStudyInfo` |
| Data collectors with abbreviation/affiliation | `buildMethod` |
| Controlled-vocabulary fields (`sampProcVC`, `collModeCV`, `resInstruCV`, `timeMeth`) | `buildMethod` |
| Data access flag (`madProgedo`) | `buildAccess` |
| Related materials, related studies, bibliographies | `buildRelatedMaterials` |
| File descriptions and file versions | `buildFileDescriptions` |

For those, follow the same four steps as [Adding a new parent](#adding-a-new-parent),
but write the node construction and reverse mapping by hand, using the helpers
in `lib/ddiXml.ts` (`leaf`, `branch`, `recordList`, `firstString`, `valueList`)
and in `lib/ddiImport.ts` (`textOf`, `attr`, `list`, `records`).

## DDI 2.6, 2.5 and 2.1

| | DDI 2.6 | DDI 2.5 | DDI 2.1 |
| --- | --- | --- | --- |
| Namespace | `ddi:codebook:2_6` | `ddi:codebook:2_5` | `http://www.icpsr.umich.edu/DDI` |
| `codeBook/@version` | `2.6` | `2.5` | `2.1` |
| Selector | Global admin selector | Global admin selector | Global admin selector |

A single generator handles all three versions. DDI 2.6 is backward compatible
with 2.5: a valid 2.5 document becomes a valid 2.6 document by changing the
namespace and the `codeBook/@version` attribute. The generator therefore uses
the 2.5 code path for 2.6 unless a field needs a version-specific shape.
Version-specific behaviour lives in:

- `versionStatementNode()`: DDI 2.5 and 2.6 store the version date in
  `<notes>`, DDI 2.1 stores it in the `date` attribute.
- `buildFileDescriptions()`: DDI 2.1 only keeps the first file name, file type
  and file version. DDI 2.5 and 2.6 keep repeating elements.

When adding a field, check that the element and attributes exist in every
version you enable. If not, use the existing `version === '2.1'` pattern or add
a `versions` restriction to the registry entry.

## DDI Lifecycle 3.3 and 4.0

DDI Lifecycle is a newer, modular model. FLUVIAL exports two versions:

| | DDI Lifecycle 3.3 | DDI Lifecycle 4.0 |
| --- | --- | --- |
| Serialisation | XML | JSON |
| Media type | `application/xml` | `application/json` |
| Extension | `.xml` | `.json` |
| Root | `ddi:DDIInstance` | `topLevelReferences` + `items` |
| Builder | `lib/ddiLifecycle33.ts` | `lib/ddiLifecycle40.ts` |

Both builders consume the normalised study model produced by
`lib/ddiLifecycle.ts`. That module reads `responses.json` once, applying the
source-key mapping; each builder then arranges the model in the schema order of
its own version. DDI Lifecycle is **export-only**: the importer still accepts
Codebook 2.6, 2.5 and 2.1.

### The parametric conversion table

`data/ddi-lifecycle-mapping.json` contains the conversion table.
`lib/ddiLifecycleMapping.ts` is the typed loader and the only module that reads
the file. The builders ask for named values, so changing a source key, an
element name or a label does not require touching the generator code.

| Section | Contents |
| --- | --- |
| `agency`, `language`, `version` | Defaults for URN agency, metadata language and version when `responses.json` has no version statement. |
| `versions` | Per-version format, media type, file extension, namespace, schema URL, root name and XML prefixes. |
| `labels` | Generated French labels: study type, collection event, roles, material names, file label... |
| `vocabularies` | CESSDA controlled-vocabulary URIs used by `controlledVocabularyURN` / `ControlledVocabularyURI`. |
| `sources` | Flat response keys for each logical value, in priority order. Example: `analysisUnits: ["analyUnit", "anlyUnit"]` accepts both spellings. |
| `itemFields` | Keys read inside repeated objects (people, funders, files, dates, version statements). |
| `listSeparators` | Separators used to split one string into several values; `dataKind` uses `,` and `;`. |
| `elements` | DDI 3.3 XML element names and DDI 4.0 JSON property names. |

Edit the JSON file directly and restart the development server: it is imported
statically. Keep the file valid JSON. A missing name raises an explicit error
such as `Correspondance DDI Lifecycle 3.3 manquante pour « language ».`

### Conversion summary

| FLUVIAL data | DDI Lifecycle placement |
| --- | --- |
| `titl`, `subTitl`, `altTitl`, `parTitl` | `Citation/Title`, `SubTitle`, `AlternateTitle`. |
| Authors, referents, metadata team | `Citation/Creator` (name and affiliation). |
| Producers, distributors | `Citation/Publisher` with a role code. |
| Contributors | `Citation/Contributor` with a role code. |
| `IDNo@DOI` | `Citation/InternationalIdentifier` with managing agency `DOI`. |
| `topcClas@Ined`, `topcClas@Cessda`, `keywords` | `Coverage/TopicalCoverage` (`Subject`, `Keyword`). Keywords keep their vocabulary URI. |
| `nation`, `geogCover` | `Coverage/SpatialCoverage` and `Universe/GeographyOfUniverse`. |
| `timePrd` | `Coverage/TemporalCoverage/ReferenceDate` and `Universe/TimePeriod`. |
| `analyUnit`, `dataKind` | `StudyUnit/AnalysisUnit`, `StudyUnit/KindOfData`, with CESSDA vocabulary URIs. |
| `financer` | `StudyUnit/FundingInformation`. |
| `collDate`, `collModeCV`, `collMode`, `collSitu`, `cleanOps` | `DataCollection` → `Methodology` and `CollectionEvent`. |
| `timeMeth`, `sampProcVC`, `sampProc`, `weight`, `dataAppr` | `Methodology` (`TimeMethod`, `SamplingProcedure`, `DataCollectionMethodology`). |
| `relMats`, `relStdies`, bibliographies, website, files, Progedo access | `OtherMaterialScheme` → `OtherMaterial` entries. |

Date values are normalised to the DDI 4 COGS date arms (`Date`, `GYearMonth`,
`GYear`, `Duration`...). DDI 3.3 receives the equivalent ISO spelling.

In DDI 3.3, the study unit references the universe (`UniverseReference`), the
conceptual component, and the data collection. In DDI 4.0, the root document
contains a `topLevelReferences` list and an `items` list; `StudyUnit` points to
`Universe`, `DataCollection` and `OtherMaterialScheme` with `Reference` objects,
and every `OtherMaterial` is a separate item referenced by the scheme.

### Lifecycle-specific behaviour

- IDs are derived from the study identifier: `fr.ined.<study-id>` for the
  instance, `<study-id>.studyunit`, `<study-id>.event1`, etc. The URN is
  `urn:ddi:<agency>:<id>:<version>`.
- When no version statement exists, the version defaults to `versions.version`
  in the mapping file (`1`).
- `timePrd` and `collDate` records that split a bound across two entries
  (`@event: "start"` then `@event: "end"`) are paired into one date range.
- Fields with no direct Lifecycle equivalent (for example `frequenc`,
  `respRate`, `resInstru`, file details or the Progedo access flag) are written
  as descriptions or `OtherMaterial` entries, so no information is silently
  dropped.

## Schema ordering and validity

DDI Codebook uses XML Schema `xs:sequence` in several places. Element order is
therefore significant. A field can compile, appear in the XML, and still make
the document invalid because it was inserted at the wrong position.

Always validate after changing a mapping. Useful references:

- DDI Codebook 2.6 product page:
  <https://ddialliance.org/ddi-codebook_v2.6>
- DDI Codebook 2.6 element documentation:
  <https://docs.ddialliance.org/DDI-Codebook/2.6/xmlschema/index.html>
- DDI Codebook 2.6 XSD:
  <https://ddialliance.org/Specification/DDI-Codebook/2.6/XMLSchema/codebook.xsd>
- DDI Codebook 2.5 specification:
  <https://ddialliance.org/Specification/DDI-Codebook/2.5/>
- DDI Codebook 2.5 element documentation:
  <https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/index.html>
- DDI Codebook 2.5 XSD:
  <https://ddialliance.org/Specification/DDI-Codebook/2.5/XMLSchema/codebook.xsd>
- DDI Codebook 2.1 specification:
  <https://ddialliance.org/ddi-codebook_v2.1>
- DDI Codebook 2.1 XSD:
  <https://ddialliance.org/Specification/DDI-Codebook/2.1/XMLSchema/Version2-1.xsd>
- DDI Lifecycle 3.3 specification:
  <https://ddialliance.org/Specification/DDI-Lifecycle/3.3/>
- DDI Lifecycle 3.3 entry XSD:
  <https://ddialliance.org/Specification/DDI-Lifecycle/3.3/XMLSchema/instance.xsd>
- DDI Lifecycle 4.0 specification:
  <https://ddialliance.org/Specification/DDI-Lifecycle/4.0/>
- DDI Lifecycle 4.0 JSON Schema:
  <https://ddialliance.org/Specification/DDI-Lifecycle/4.0/JSONSchema/lifecycle40.schema.json>

The admin UI also exposes these links and a per-element documentation chip list
for Codebook versions.

## Validation

1. Type-check the application:

   ```bash
   npx tsc --noEmit
   ```

2. Start the app and export each version you support from `/admin`.

3. Validate the XML against the official XSD with any XML Schema validator
   (`xmllint`, oXygen, Visual Studio, .NET `XmlSchemaSet`, etc.). The 2.6, 2.5,
   2.1 and Lifecycle 3.3 schemas should all report `VALID`.

4. Validate the Lifecycle 4.0 JSON against the official JSON Schema, for example
   with `ajv-cli`:

   ```bash
   npx ajv-cli@5 validate --spec=draft2020 --strict=false \
     -s lifecycle40.schema.json -d export.json
   ```

   The schema uses a COGS extension vocabulary; `--strict=false` only disables
   the unknown-keyword warning.

5. Re-import a Codebook export and check that the field appears in
   `responses.json`.

6. Check that a malformed file still returns HTTP 400 and that unauthenticated
   requests return HTTP 403.

## API reference

### Export

```http
GET /api/survey/<instanceId>/export/ddi?version=2.6|2.5|2.1|3.3|4.0
Authorization: Bearer <adminToken>
```

- `200` with `application/xml` (Codebook 2.x and Lifecycle 3.3) or
  `application/json` (Lifecycle 4.0) and a download filename.
- `403` when the admin token is missing or invalid.
- `404` when the instance does not exist or has no responses.
- `500` on generation failure.

### Import

```http
POST /api/survey/<instanceId>/import/ddi
Authorization: Bearer <adminToken>
Content-Type: application/xml

<codeBook ...>...</codeBook>
```

- `200` with `{ message, version, fields, warnings }`.
- `400` for empty, malformed, DTD-containing or unmappable files.
- `403` when the admin token is missing or invalid.
- `404` when the instance does not exist.
- `500` on an unexpected server error.

The route parameter is the **instance id**, not the survey token. Responses are
loaded and saved with the instance's `token`.

## Round-trip limitations

Import is not a perfect inverse of export. Known limitations:

- **Controlled-vocabulary numeric codes** (`timeMeth`, `sampProcVC`,
  `collModeCV`, `resInstruCV`, `analyUnit`) are exported as text labels.
  Import cannot recover the original numeric CESSDA codes; numeric-looking
  values are put in the `*VC` arrays and other text goes to the detail field.
- **Legacy keys**: old responses may use `question10`, `analyUnit` or
  `Évaluation de la qualité des données`. Import writes the current template
  keys (`relMat@url`, `analyUnit`, `dataAppr`).
- **DDI 2.1 file descriptions** keep only the first file name, file type and
  file version.
- **Application-only fields** such as `logoFile` are not in DDI. Import
  preserves the existing `logoFile` because it is an uploaded asset, not study
  metadata.
- **Whitespace**: import trims trailing spaces/newlines and normalizes some
  whitespace. This is expected.
- **Replacement**: import replaces the instance's metadata; it does not merge
  with existing values (except `logoFile`).

## Related files

- Codebook generator: `lib/ddi.ts`
- Codebook registry: `lib/ddiMapping.ts`
- XML helpers: `lib/ddiXml.ts`
- Lifecycle conversion table: `data/ddi-lifecycle-mapping.json`
- Lifecycle loader: `lib/ddiLifecycleMapping.ts`
- Lifecycle shared model: `lib/ddiLifecycle.ts`
- Lifecycle 3.3 generator: `lib/ddiLifecycle33.ts`
- Lifecycle 4.0 generator: `lib/ddiLifecycle40.ts`
- Importer: `lib/ddiImport.ts`
- Questionnaire: `data/survey-template.json`
- Stored responses: `data/responses/<token>/responses.json`
- Admin UI: `app/admin/page.tsx`
