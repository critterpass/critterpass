import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { registerFonts } from '@cp/critter-art/share';

import { loadAppIconManifest } from '../src/manifest';
import { APP_ICONS } from '../src/templates/app-icons';
import {
  writeAndroidAdaptiveIcon,
  writeAndroidBackgroundColors,
} from '../src/writers/app-icon-android';
import {
  findIctool,
  writeFlatAppIconSet,
  writeIconComposerBundle,
} from '../src/writers/app-icon-ios';
import { writeStampVectorDrawable } from '../src/writers/vector-drawable';

const manifestPath = fileURLToPath(new URL('../manifests/app-icons.json', import.meta.url));
const generatedRoot = fileURLToPath(
  new URL('../../../apps/mobile/generated/critter-art/', import.meta.url),
);

async function main(): Promise<void> {
  const manifest = loadAppIconManifest(manifestPath);
  const fontPath = fileURLToPath(
    new URL(manifest.fontFile, new URL('../manifests/', import.meta.url)),
  );
  registerFonts([{ family: manifest.fontFamily, bytes: readFileSync(fontPath) }]);

  const iosDir = `${generatedRoot}${manifest.outIos}`;
  const androidDir = `${generatedRoot}${manifest.outAndroid}`;

  const ictoolPath = findIctool();
  if (!ictoolPath) {
    console.warn(
      'generate-app-icons: ictool not found (needs Xcode 26+ with Icon Composer, macOS only) — ' +
        'writing .icon bundles but skipping the flat light/dark/tinted fallback export.',
    );
  }

  for (const def of APP_ICONS) {
    await writeIconComposerBundle(iosDir, def);
    if (ictoolPath) {
      writeFlatAppIconSet(`${iosDir}/${def.id}.icon`, iosDir, def, ictoolPath, manifest.flatSizePx);
    }
    await writeAndroidAdaptiveIcon(androidDir, def, manifest.androidForegroundPx);
  }
  writeAndroidBackgroundColors(androidDir, APP_ICONS);

  const stampDef = APP_ICONS.find((def) => def.id === 'stamp');
  if (!stampDef) throw new Error('generate-app-icons: expected an APP_ICONS entry with id "stamp"');
  writeStampVectorDrawable(androidDir, {
    critterSpec: {
      kind: stampDef.character.kind,
      seed: stampDef.character.seed,
      pose: stampDef.character.pose,
      variant: 'mask',
      maskColor: '#ffffff',
    },
  });

  console.log(
    `generate-app-icons: ${APP_ICONS.length} icon(s) written to ${iosDir} and ${androidDir}` +
      (ictoolPath ? '' : ' (flat fallbacks skipped — no ictool on this machine)'),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
