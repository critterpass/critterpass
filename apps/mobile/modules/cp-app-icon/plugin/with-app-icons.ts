/**
 * Bundles the alternate app icons the icon bake wrote (`generated/critter-art/app-icons/`) so
 * cp-app-icon can switch to them.
 *
 * - iOS: each icon's Icon Composer `.icon` bundle becomes an alternate icon (it follows the
 *   system's light, dark and tinted looks by itself), listed in the app target's
 *   `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`. A forced appearance (`stamp-dark`) is a
 *   one-image app icon set in the main asset catalog, bundled only for the appearances passed in
 *   `forcedAppearances`: each one costs about 2 MB of compiled asset catalog per icon.
 * - Android: one `activity-alias` of MainActivity per icon, the default one enabled; the launcher
 *   entry moves from MainActivity to that alias, so switching never leaves the app without one.
 *
 * PASSPORT in the automatic appearance is the primary icon and gets no alternate. Self-contained
 * on purpose: Expo loads config plugins with Node's plain TypeScript stripping, which cannot
 * resolve relative extensionless imports or workspace packages.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
  type ConfigPlugin,
} from 'expo/config-plugins';

/** `@cp/domain` APP_ICON_BASE_IDS (with-app-icons.test.ts pins the two lists together). */
export const APP_ICON_IDS = [
  'face',
  'passport',
  'stamp',
  'sticker',
  'temple',
  'sardi',
  'home-set',
  'pon',
  'golden',
  'bali-six',
] as const;
export const PRIMARY_ICON_ID = 'passport';
export type ForcedAppearance = 'light' | 'dark' | 'tinted';

export interface AppIconsOptions {
  readonly forcedAppearances?: readonly ForcedAppearance[];
}

const GENERATED = ['generated', 'critter-art', 'app-icons'];
const ALIAS_PREFIX = '.CpIcon_';

/** The `.icon` bundles that become automatic-appearance alternates. */
export function automaticAlternateIds(): string[] {
  return APP_ICON_IDS.filter((id) => id !== PRIMARY_ICON_ID);
}

/** Native names of the forced-appearance alternates (`passport-dark`). */
export function forcedAlternateNames(appearances: readonly ForcedAppearance[]): string[] {
  return APP_ICON_IDS.flatMap((id) => appearances.map((appearance) => `${id}-${appearance}`));
}

/** The bake writes `any`, `dark` and `tinted` images; a forced LIGHT is the `any` image. */
function forcedImageFile(id: string, appearance: ForcedAppearance): string {
  return `${id}-${appearance === 'light' ? 'any' : appearance}.png`;
}

export function forcedIconSetContents(filename: string): string {
  const contents = {
    images: [{ filename, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  };
  return `${JSON.stringify(contents, null, 2)}\n`;
}

function writeIosIcons(projectRoot: string, appDir: string, forced: readonly ForcedAppearance[]) {
  const generated = join(projectRoot, ...GENERATED, 'ios');
  for (const id of automaticAlternateIds()) {
    const source = join(generated, `${id}.icon`);
    if (!existsSync(source)) throw new Error(`with-app-icons: ${id}.icon is not in ${generated}`);
    cpSync(source, join(appDir, `${id}.icon`), { recursive: true, force: true });
  }
  const catalog = join(appDir, 'Images.xcassets');
  for (const id of APP_ICON_IDS) {
    for (const appearance of forced) {
      const file = forcedImageFile(id, appearance);
      const set = join(catalog, `${id}-${appearance}.appiconset`);
      mkdirSync(set, { recursive: true });
      cpSync(join(generated, `${id}.appiconset`, file), join(set, file));
      writeFileSync(join(set, 'Contents.json'), forcedIconSetContents(file));
    }
  }
}

/** `home-set` -> `home_set`: resource and class names cannot hold a hyphen. */
export function resourceSlug(id: string): string {
  return id.replace(/-/g, '_');
}

function writeAndroidIcons(projectRoot: string, resDir: string) {
  const generated = join(projectRoot, ...GENERATED, 'android');
  for (const dir of ['drawable-xxxhdpi', 'mipmap-anydpi-v26', 'values']) {
    cpSync(join(generated, dir), join(resDir, dir), { recursive: true, force: true });
  }
  // Launchers below API 26 read no adaptive icon: they get the foreground layer as a plain icon.
  const fallback = join(resDir, 'mipmap-xxxhdpi');
  mkdirSync(fallback, { recursive: true });
  for (const file of readdirSync(join(generated, 'drawable-xxxhdpi'))) {
    const match = /^ic_launcher_foreground_(.+)\.png$/.exec(file);
    if (match?.[1]) {
      cpSync(
        join(generated, 'drawable-xxxhdpi', file),
        join(fallback, `ic_launcher_${match[1]}.png`),
      );
    }
  }
}

type Manifest = AndroidConfig.Manifest.AndroidManifest;
type IntentFilter = AndroidConfig.Manifest.ManifestIntentFilter;
type Activity = AndroidConfig.Manifest.ManifestActivity;
interface ActivityAlias {
  $: Record<string, string>;
  'intent-filter': IntentFilter[];
}

const LAUNCHER_FILTER: IntentFilter = {
  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
};

function isLauncherFilter(filter: IntentFilter): boolean {
  return (filter.category ?? []).some(
    (category) => category.$['android:name'] === 'android.intent.category.LAUNCHER',
  );
}

/** One alias per icon, the default (primary) one enabled; the launcher entry moves onto them. */
export function applyIconAliases(manifest: Manifest): Manifest {
  const activity: Activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const target = activity.$['android:name'];
  activity['intent-filter'] = (activity['intent-filter'] ?? []).filter(
    (filter) => !isLauncherFilter(filter),
  );
  const alias = (suffix: string, icon: string, enabled: boolean): ActivityAlias => ({
    $: {
      'android:name': `${ALIAS_PREFIX}${suffix}`,
      'android:targetActivity': target,
      'android:enabled': String(enabled),
      'android:exported': 'true',
      'android:icon': icon,
      'android:roundIcon': icon,
    },
    'intent-filter': [LAUNCHER_FILTER],
  });
  const aliases = [
    alias('default', '@mipmap/ic_launcher', true),
    ...automaticAlternateIds().map((id) =>
      alias(resourceSlug(id), `@mipmap/ic_launcher_${resourceSlug(id)}`, false),
    ),
  ];
  const holder = application as unknown as { 'activity-alias'?: ActivityAlias[] };
  const others = (holder['activity-alias'] ?? []).filter(
    (existing) => !existing.$['android:name']?.startsWith(ALIAS_PREFIX),
  );
  holder['activity-alias'] = [...others, ...aliases];
  return manifest;
}

/** The parts of the `xcode` package's project object this plugin reads. */
export interface PbxProject {
  pbxNativeTargetSection(): Record<
    string,
    { name?: string; buildConfigurationList?: string } | string
  >;
  pbxXCConfigurationList(): Record<string, { buildConfigurations?: { value: string }[] } | string>;
  pbxXCBuildConfigurationSection(): Record<
    string,
    { buildSettings?: Record<string, string> } | string
  >;
}

/**
 * The build settings of the app target's configurations only: an extension's catalog (the App
 * Clip's) has none of these icons.
 */
export function appTargetBuildSettings(
  project: PbxProject,
  projectName: string,
): Record<string, string>[] {
  const unquote = (value: string | undefined) => value?.replace(/^"(.*)"$/u, '$1');
  const target = Object.values(project.pbxNativeTargetSection()).find(
    (entry) => typeof entry === 'object' && unquote(entry.name) === projectName,
  );
  if (typeof target !== 'object' || !target.buildConfigurationList) {
    throw new Error(`with-app-icons: no ${projectName} target`);
  }
  const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const ids =
    typeof list === 'object' ? (list.buildConfigurations ?? []).map((ref) => ref.value) : [];
  const section = project.pbxXCBuildConfigurationSection();
  return ids.flatMap((id) => {
    const configuration = section[id];
    return typeof configuration === 'object' && configuration.buildSettings
      ? [configuration.buildSettings]
      : [];
  });
}

const withAppIcons: ConfigPlugin<AppIconsOptions | undefined> = (config, options) => {
  const forced = options?.forcedAppearances ?? [];
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const appDir = IOSConfig.Paths.getSourceRoot(mod.modRequest.projectRoot);
      writeIosIcons(mod.modRequest.projectRoot, appDir, forced);
      return mod;
    },
  ]);
  config = withXcodeProject(config, (mod) => {
    const projectName = mod.modRequest.projectName;
    if (!projectName) throw new Error('with-app-icons: no iOS project name');
    for (const id of automaticAlternateIds()) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${id}.icon`,
        groupName: projectName,
        // The `xcode` package ships no types; Expo's helpers take its project object as is.
        project: mod.modResults as never,
        isBuildFile: true,
      });
    }
    const names = [...automaticAlternateIds(), ...forcedAlternateNames(forced)].join(' ');
    for (const settings of appTargetBuildSettings(
      mod.modResults as unknown as PbxProject,
      projectName,
    )) {
      settings['ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'] = `"${names}"`;
      settings['ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS'] = 'NO';
    }
    return mod;
  });
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const resDir = join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      writeAndroidIcons(mod.modRequest.projectRoot, resDir);
      return mod;
    },
  ]);
  return withAndroidManifest(config, (mod) => {
    mod.modResults = applyIconAliases(mod.modResults);
    return mod;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withAppIcons;
