# DDI validation schemas

Vendored copies of the official DDI schemas used by the `DDI validation`
workflow (`.github/workflows/ddi-validation.yml`). Keeping them in the
repository makes the check self-contained: the runner never has to reach
`ddialliance.org`, and a schema update is an explicit, reviewable commit.

Every file is the published DDI Alliance material, retrieved on 2026-11-17.

| Directory | Source |
| --- | --- |
| `codebook-2.6/` | DDI Codebook 2.6 package, `schemas/` directory: <https://github.com/ddialliance/ddi-c_2/releases/download/2.6/ddi-c_2-6_2026-04-15.zip> |
| `codebook-2.5/` | DDI Codebook 2.5 package, `schemas/` directory: <https://ddialliance.org/hubfs/Specification/DDI-Codebook/2.5/ddi_2_5_1.zip> |
| `codebook-2.1/` | <https://ddialliance.org/Specification/DDI-Codebook/2.1/XMLSchema/Version2-1.xsd>, plus `xml.xsd` from the 2.6 package |
| `lifecycle-3.3/` | DDI Lifecycle 3.3 `XMLSchema` directory (`instance.xsd` and its imports) |
| `lifecycle-4.0/` | DDI Lifecycle 4.0 JSON Schema, `lifecycle40.schema.json` (COGS extension vocabulary) |

## Local edits

The Codebook schemas import the XML namespace schema through the W3C URLs
`http://www.w3.org/2001/xml.xsd` and `http://www.w3.org/2001/03/xml.xsd`. Those
remote locations are not fetched during validation (`xmllint --nonet`), so the
`schemaLocation` values were rewritten to the local `xml.xsd`:

- `codebook-2.1/Version2-1.xsd`
- `codebook-2.6/dc.xsd`, `codebook-2.6/dcterms.xsd`, `codebook-2.6/xml.xsd`
- `codebook-2.5/xml.xsd`

No grammar, type or element definition was modified; only the import target.
Codebook 2.6 and 2.5 keep their complete `XHTML/` module tree, which the
`ddi-xhtml11*.xsd` files include.

## Validator notes

- Codebook and Lifecycle 3.3 are XML Schema 1.0 documents validated with
  `xmllint --noout --schema <schema> <document>`.
- DDI Lifecycle 4.0 is a JSON document validated with `ajv-cli`. The schema uses
  the COGS extension keyword `x-cogs-version`, hence `--strict=false`; the
  `ajv-formats` plugin is loaded so `format: uri`, `date` and `date-time` are
  actually enforced.
