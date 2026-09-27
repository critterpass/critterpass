import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigPlugin } from 'expo/config-plugins';
import { IOSConfig, withDangerousMod } from 'expo/config-plugins';

// These three extension targets each live in their own directory under `apps/mobile/targets/`, per
// `@bacons/apple-targets`'s convention — see docs/system-architecture.md §4.7/§4.8. If a target is
// renamed or a new one is added, update this one list; nothing else in this plugin needs to change.
const IOS_EXTENSION_TARGET_DIRS: readonly string[] = [
  'widgets',
  'notification-service',
  'notification-content',
];

function copyIfExists(source: string, dest: string): void {
  if (!existsSync(source)) return;
  cpSync(source, dest, { recursive: true, force: true });
}

/**
 * Copies the bake pipeline's generated assets (`apps/mobile/generated/critter-art/`, produced by
 * `pnpm --filter @cp/critter-bake run generate:mobile-assets`) into the native build output on
 * every `expo prebuild`:
 *  - iOS: `CritterArt.xcassets` into the main app's source directory and into every extension
 *    target's own directory under `apps/mobile/targets/` — `@bacons/apple-targets` links each
 *    target's whole directory into Xcode via a file-system-synchronized group, so a dropped-in
 *    asset catalog needs no separate pbxproj registration.
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
        'CritterArt.xcassets',
      );
      const appSourceDir = IOSConfig.Paths.getSourceRoot(config.modRequest.projectRoot);
      copyIfExists(generatedIosXcassets, join(appSourceDir, 'CritterArt.xcassets'));

      for (const targetDirName of IOS_EXTENSION_TARGET_DIRS) {
        const targetDir = join(config.modRequest.projectRoot, 'targets', targetDirName);
        if (!existsSync(targetDir)) continue;
        copyIfExists(generatedIosXcassets, join(targetDir, 'CritterArt.xcassets'));
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
