import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigPlugin } from 'expo/config-plugins';
import { IOSConfig, withDangerousMod } from 'expo/config-plugins';

/**
 * The critter art each iOS extension target draws, by imageset name. Each extension lives in its
 * own directory under `apps/mobile/targets/` (`@bacons/apple-targets`' convention, see
 * docs/system-architecture.md §4.7/§4.8) and gets a `CritterArt.xcassets` holding only these
 * imagesets. An extension has no supported access to the host app's bundle resources, so what it
 * draws ships inside it; anything else in the catalog is download size nobody sees. The whole
 * catalog is about 10 MB, so embedding it per extension multiplied it by the number of targets.
 *
 * with-critter-art.test.ts scans each target's Swift sources for catalog names, so an extension
 * that starts drawing another image fails CI until the name is listed here.
 */
export const IOS_EXTENSION_CRITTER_ART: Readonly<Record<string, readonly string[]>> = {
  // Live Activities: each guide's critter, idle and cheering (LiveActivities/LiveActivityStyle.swift).
  widgets: [
    'alpaca-common-cheer-color-48pt',
    'alpaca-common-idle-color-48pt',
    'axolotl-common-cheer-color-48pt',
    'axolotl-common-idle-color-48pt',
    'gecko-common-cheer-color-48pt',
    'gecko-common-idle-color-48pt',
    'langur-common-cheer-color-48pt',
    'langur-common-idle-color-48pt',
    'puffin-common-cheer-color-48pt',
    'puffin-common-idle-color-48pt',
    'sardine-common-cheer-color-48pt',
    'sardine-common-idle-color-48pt',
    'tanuki-common-cheer-color-48pt',
    'tanuki-common-idle-color-48pt',
  ],
  // AvatarLoader.guideDefaultImageName: the face a notification shows when no avatar loads.
  'notification-service': ['gecko-common-idle-color-96pt'],
  // The vote poster's two sides (notification-content/VotePosterView.swift).
  'notification-content': ['sardine-common-idle-color-48pt', 'tanuki-common-idle-color-48pt'],
};

const CATALOG_NAME = 'CritterArt.xcassets';

function copyIfExists(source: string, dest: string): void {
  if (!existsSync(source)) return;
  cpSync(source, dest, { recursive: true, force: true });
}

/**
 * Writes `targetCatalog` as a catalog holding only `imagesets` from `generatedCatalog`, replacing
 * whatever an earlier prebuild left there. With no imagesets the target gets no catalog at all.
 */
export function writeExtensionCatalog(
  generatedCatalog: string,
  targetCatalog: string,
  imagesets: readonly string[],
): void {
  rmSync(targetCatalog, { recursive: true, force: true });
  if (imagesets.length === 0 || !existsSync(generatedCatalog)) return;
  mkdirSync(targetCatalog, { recursive: true });
  cpSync(join(generatedCatalog, 'Contents.json'), join(targetCatalog, 'Contents.json'));
  for (const name of imagesets) {
    const source = join(generatedCatalog, `${name}.imageset`);
    if (!existsSync(source)) {
      throw new Error(`with-critter-art: ${name}.imageset is not in the generated critter art`);
    }
    cpSync(source, join(targetCatalog, `${name}.imageset`), { recursive: true });
  }
}

/**
 * Copies the bake pipeline's generated assets (`apps/mobile/generated/critter-art/`, produced by
 * `pnpm --filter @cp/critter-bake run generate:mobile-assets`) into the native build output on
 * every `expo prebuild`:
 *  - iOS: `CritterArt.xcassets` into the main app's source directory, and into each extension
 *    target's own directory under `apps/mobile/targets/` reduced to the imagesets that target
 *    draws (`IOS_EXTENSION_CRITTER_ART`) — `@bacons/apple-targets` links each target's whole
 *    directory into Xcode via a file-system-synchronized group, so a dropped-in asset catalog
 *    needs no separate pbxproj registration.
 *  - Android: the generated `res/drawable-*` directories into the app module's `res/`.
 */
export const withCritterArt: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const generatedIosXcassets = join(
        config.modRequest.projectRoot,
        'generated',
        'critter-art',
        'ios',
        CATALOG_NAME,
      );
      const appSourceDir = IOSConfig.Paths.getSourceRoot(config.modRequest.projectRoot);
      copyIfExists(generatedIosXcassets, join(appSourceDir, CATALOG_NAME));

      for (const [targetDirName, imagesets] of Object.entries(IOS_EXTENSION_CRITTER_ART)) {
        const targetDir = join(config.modRequest.projectRoot, 'targets', targetDirName);
        if (!existsSync(targetDir)) continue;
        writeExtensionCatalog(generatedIosXcassets, join(targetDir, CATALOG_NAME), imagesets);
      }
      return config;
    },
  ]);

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const generatedAndroidRes = join(
        config.modRequest.projectRoot,
        'generated',
        'critter-art',
        'android',
        'res',
      );
      const androidResDir = join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );
      copyIfExists(generatedAndroidRes, androidResDir);
      return config;
    },
  ]);

  return config;
};

// Expo's config plugin loader resolves a bare module-path plugin entry via its default export.
// `export { X as default }` produces the same interop shape as `export default X` without tripping
// this repo's named-exports-only lint rule (which only matches the `export default` syntax form).
export { withCritterArt as default };
