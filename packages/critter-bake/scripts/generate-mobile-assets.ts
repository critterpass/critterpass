import { fileURLToPath } from 'node:url';

import { loadManifest } from '../src/manifest';
import { runPool } from '../src/pool';
import { expandManifest } from '../src/render-job';
import { buildAppGroupKeyIndex, writeAppGroupKeyIndex } from '../src/writers/app-group-keys';
import { buildAndroidResFiles, writeAndroidRes } from '../src/writers/android-res';
import { buildImagesets, writeXcassetCatalog } from '../src/writers/xcassets';

const manifestPath = fileURLToPath(new URL('../manifests/tier-a.json', import.meta.url));
const generatedRoot = fileURLToPath(
  new URL('../../../apps/mobile/generated/critter-art/', import.meta.url),
);

async function main(): Promise<void> {
  const manifest = loadManifest(manifestPath);
  const jobs = expandManifest(manifest.targets);
  const outputs = await runPool(jobs, { concurrency: 2 });

  const imagesets = buildImagesets(jobs, outputs);
  writeXcassetCatalog(`${generatedRoot}ios/CritterArt.xcassets`, imagesets);

  const androidFiles = buildAndroidResFiles(jobs, outputs);
  writeAndroidRes(`${generatedRoot}android/res`, androidFiles);

  const keyIndex = buildAppGroupKeyIndex(jobs);
  writeAppGroupKeyIndex(`${generatedRoot}app/app-group-keys.json`, keyIndex);

  console.log(
    `generate-mobile-assets: ${imagesets.length} imageset(s) (iOS), ${androidFiles.length} drawable(s) (Android), ${
      Object.keys(keyIndex).length
    } App Group key(s).`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
