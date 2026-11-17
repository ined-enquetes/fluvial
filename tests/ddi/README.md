# DDI export validation fixtures

Synthetic metadata used by `.github/workflows/ddi-validation.yml`. The fixtures
contain no real survey data; they exist to exercise the conversions, including
the cases that previously broke schema validation (free-text collection cycles,
split date bounds, numeric controlled-vocabulary codes, files and materials).

| Fixture | Purpose |
| --- | --- |
| `fixtures/full.json` | Every supported source key: titles, people, funders, coverage, dates, methodology, version statements, files and related materials. |
| `fixtures/minimal.json` | A single title, to check defaults and empty collections. |

Each fixture yields five exports, one per supported version:

```
<fixture>-codebook-2.6.xml
<fixture>-codebook-2.5.xml
<fixture>-codebook-2.1.xml
<fixture>-lifecycle-3.3.xml
<fixture>-lifecycle-4.0.json
```

## Running locally

From the repository root, generate the exports into `tests/ddi/output/`
(git-ignored):

```bash
npx --yes tsx@4.23.15 scripts/ddi-fixtures.ts
```

Then validate them against the vendored schemas:

```bash
# XML exports (repeat per fixture and per version)
xmllint --nonet --noout \
  --schema tests/ddi/schemas/codebook-2.6/codebook.xsd \
  tests/ddi/output/full-codebook-2.6.xml
xmllint --nonet --noout \
  --schema tests/ddi/schemas/codebook-2.5/codebook.xsd \
  tests/ddi/output/full-codebook-2.5.xml
xmllint --nonet --noout \
  --schema tests/ddi/schemas/codebook-2.1/Version2-1.xsd \
  tests/ddi/output/full-codebook-2.1.xml
xmllint --nonet --noout \
  --schema tests/ddi/schemas/lifecycle-3.3/instance.xsd \
  tests/ddi/output/full-lifecycle-3.3.xml
```

```bash
# Lifecycle 4.0 JSON
npx --yes -p ajv-cli@5.0.0 -p ajv-formats ajv validate \
  --spec=draft2020 --strict=false -c ajv-formats \
  -s tests/ddi/schemas/lifecycle-4.0/lifecycle40.schema.json \
  -d tests/ddi/output/full-lifecycle-4.0.json
```

The workflow runs the same checks on every pull request that touches the DDI
generators, the export route, the conversion table, the fixtures or this
directory. It also fails when no file matches a version glob, so a fixture that
silently stops producing an export cannot pass.

## Adding a fixture

Drop a JSON file in `fixtures/` shaped like `responses.json` (the flat metadata
object stored for an instance). The script picks it up automatically and the
workflow validates all five exports for it.
