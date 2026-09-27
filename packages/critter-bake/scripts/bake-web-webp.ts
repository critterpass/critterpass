import { fileURLToPath } from 'node:url';

import { writeWebWebp } from '../src/writers/web-webp';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = fileURLToPath(new URL('../manifests/web.json', import.meta.url));

writeWebWebp(manifestPath, repoRoot)
  .then((result) => {
    console.log(
      `web-webp: ${result.fileCount} file(s), ${Object.keys(result.index).length} sprite key(s).`,
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
