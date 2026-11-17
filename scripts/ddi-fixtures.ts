/**
 * Generate DDI exports from the committed fixtures.
 *
 * The GitHub workflow `ddi-validation.yml` runs this script and then checks
 * every generated file against the official schemas vendored in
 * `tests/ddi/schemas/`. Running it locally produces the same files so a
 * failure can be reproduced without CI:
 *
 *   npx --yes tsx@4.23.15 scripts/ddi-fixtures.ts D:\Temp\ddi-out
 *
 * Each fixture yields one file per supported version:
 *
 *   <fixture>-codebook-2.6.xml
 *   <fixture>-codebook-2.5.xml
 *   <fixture>-codebook-2.1.xml
 *   <fixture>-lifecycle-3.3.xml
 *   <fixture>-lifecycle-4.0.json
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { generateDdiCodebook } from '../lib/ddi';
import type { DdiVersion } from '../lib/ddiXml';
import { generateDdiLifecycle33 } from '../lib/ddiLifecycle33';
import { generateDdiLifecycle40 } from '../lib/ddiLifecycle40';

const CODEBOOK_VERSIONS: DdiVersion[] = ['2.6', '2.5', '2.1'];

const fixturesDir = join(process.cwd(), 'tests/ddi/fixtures');
const outputDir = process.argv[2]
  ? resolve(process.argv[2])
  : join(process.cwd(), 'tests/ddi/output');

mkdirSync(outputDir, { recursive: true });

let written = 0;

for (const file of readdirSync(fixturesDir)
  .filter((entry) => entry.endsWith('.json'))
  .sort()) {
  const name = basename(file, '.json');
  const data = JSON.parse(
    readFileSync(join(fixturesDir, file), 'utf8')
  ) as Record<string, unknown>;
  const options = { fallbackTitle: name };

  for (const version of CODEBOOK_VERSIONS) {
    writeFileSync(
      join(outputDir, `${name}-codebook-${version}.xml`),
      generateDdiCodebook(data, { version, ...options }),
      'utf8'
    );
    written += 1;
  }

  writeFileSync(
    join(outputDir, `${name}-lifecycle-3.3.xml`),
    generateDdiLifecycle33(data, options),
    'utf8'
  );
  writeFileSync(
    join(outputDir, `${name}-lifecycle-4.0.json`),
    generateDdiLifecycle40(data, options),
    'utf8'
  );
  written += 2;

  console.log(`${name}: 5 exports`);
}

console.log(`${written} DDI files written to ${outputDir}`);
