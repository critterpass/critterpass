import { fileURLToPath } from 'node:url';

import { writeOgAtlas } from '../src/writers/og-atlas';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = fileURLToPath(new URL('../manifests/og-atlas.json', import.meta.url));

writeOgAtlas(manifestPath, repoRoot, 'packages/critter-bake/out/og-atlas')
  .then((result) => {
    console.log(`og-atlas: ${result.sheetCount} sheet(s), ${result.spriteCount} sprite(s).`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
