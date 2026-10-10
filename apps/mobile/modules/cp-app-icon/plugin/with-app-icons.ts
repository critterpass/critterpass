/**
 * Bundles the alternate app icons so cp-app-icon can switch to them.
 *
 * - The four designed icons (passport, face, stamp, sticker) come from
 *   `assets/app-icons/`, exported from the design by tools/design-renders/export-app-icons.mjs:
 *   on iOS an Icon Composer bundle each (light, dark, clear and tinted from one layered file),
 *   added to the app target as a resource; on Android adaptive background, foreground and
 *   monochrome layers.
 * - Earned icons come from the icon bake (`generated/critter-art/app-icons/`): on iOS a baked
 *   app icon set (light, dark and tinted images) in the asset catalog. A forced appearance
 *   (`temple-dark`) is a one-image app icon set, bundled only for the appearances passed in
 *   `forcedAppearances`.
 * - Every alternate is listed in the app target's `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`
 *   (about 5.5 MB of compiled asset catalog each).
 * - Android: one `activity-alias` of MainActivity per icon, the default one enabled; the launcher
 *   entry moves from MainActivity to that alias, so switching never leaves the app without one.
 *
 * PASSPORT in the automatic appearance is the primary icon (`ios.icon`, Expo's adaptive icon) and
 * gets no alternate. The designed alternates are bundled by default (`DEFAULT_ALTERNATE_IDS`); the
 * `alternates` option brings earned ones back. Self-contained on purpose: Expo loads config
 * plugins with Node's plain TypeScript stripping, which cannot resolve relative extensionless
 * imports or workspace packages.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
  type ConfigPlugin,
} from 'expo/config-plugins';

/** `@cp/domain` APP_ICON_BASE_IDS (src/lib/app-icon's test pins the same list). */
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

/** The icons drawn in the design and exported into `assets/app-icons/`. */
export const DESIGNED_ICON_IDS = ['passport', 'face', 'stamp', 'sticker'] as const;

/**
 * The alternates bundled unless `alternates` says otherwise: the designed ones people can switch
 * to. Any other catalogue id comes back by listing it.
 */
export const DEFAULT_ALTERNATE_IDS: readonly AppIconId[] = ['face', 'stamp', 'sticker'];
export type AppIconId = (typeof APP_ICON_IDS)[number];

export function isDesignedIcon(id: string): boolean {
  return (DESIGNED_ICON_IDS as readonly string[]).includes(id);
}

export interface AppIconsOptions {
  /** Catalogue ids to bundle besides the primary icon. */
  readonly alternates?: readonly AppIconId[];
  readonly forcedAppearances?: readonly ForcedAppearance[];
}

const GENERATED = ['generated', 'critter-art', 'app-icons'];
const DESIGNED = ['assets', 'app-icons'];
const ALIAS_PREFIX = '.CpIcon_';

/** The icons bundled as automatic-appearance alternates. */
export function automaticAlternateIds(
  alternates: readonly AppIconId[] = DEFAULT_ALTERNATE_IDS,
): string[] {
  return APP_ICON_IDS.filter((id) => id !== PRIMARY_ICON_ID && alternates.includes(id));
}

/**
 * Native names of the forced-appearance alternates (`temple-dark`): earned icons only, because a
 * designed icon's one Icon Composer bundle already follows every appearance.
 */
export function forcedAlternateNames(
  appearances: readonly ForcedAppearance[],
  alternates: readonly AppIconId[] = DEFAULT_ALTERNATE_IDS,
): string[] {
  return forcedIds(alternates).flatMap((id) =>
    appearances.map((appearance) => `${id}-${appearance}`),
  );
}

function forcedIds(alternates: readonly AppIconId[]): string[] {
  return automaticAlternateIds(alternates).filter((id) => !isDesignedIcon(id));
}

/** The designed alternates, added to the app target as Icon Composer bundles. */
export function iconComposerAlternateIds(
  alternates: readonly AppIconId[] = DEFAULT_ALTERNATE_IDS,
): string[] {
  return automaticAlternateIds(alternates).filter(isDesignedIcon);
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

function writeIosIcons(
  projectRoot: string,
  appDir: string,
  alternates: readonly AppIconId[],
  forced: readonly ForcedAppearance[],
) {
  const generated = join(projectRoot, ...GENERATED, 'ios');
  const catalog = join(appDir, 'Images.xcassets');
  for (const id of iconComposerAlternateIds(alternates)) {
    const source = join(projectRoot, ...DESIGNED, 'ios', `${id}.icon`);
    if (!existsSync(source)) throw new Error(`with-app-icons: ${source} is missing`);
    const target = join(appDir, `${id}.icon`);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
  for (const id of forcedIds(alternates)) {
    const source = join(generated, `${id}.appiconset`);
    if (!existsSync(source))
      throw new Error(`with-app-icons: ${id}.appiconset is not in ${generated}`);
    cpSync(source, join(catalog, `${id}.appiconset`), { recursive: true, force: true });
  }
  for (const id of forcedIds(alternates)) {
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
  // The designed icons' layers replace the baked ones of the same name.
  const designed = join(projectRoot, ...DESIGNED, 'android');
  for (const dir of ['drawable-xxxhdpi', 'mipmap-anydpi-v26']) {
    cpSync(join(designed, dir), join(resDir, dir), { recursive: true, force: true });
  }
  // Launchers below API 26 read no adaptive icon: they get the foreground layer as a plain icon.
  const fallback = join(resDir, 'mipmap-xxxhdpi');
  mkdirSync(fallback, { recursive: true });
  for (const file of readdirSync(join(resDir, 'drawable-xxxhdpi'))) {
    const match = /^ic_launcher_foreground_(.+)\.png$/.exec(file);
    if (match?.[1]) {
      cpSync(join(resDir, 'drawable-xxxhdpi', file), join(fallback, `ic_launcher_${match[1]}.png`));
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
export function applyIconAliases(
  manifest: Manifest,
  alternates: readonly AppIconId[] = DEFAULT_ALTERNATE_IDS,
): Manifest {
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
    ...automaticAlternateIds(alternates).map((id) =>
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
  const alternates = options?.alternates ?? DEFAULT_ALTERNATE_IDS;
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const appDir = IOSConfig.Paths.getSourceRoot(mod.modRequest.projectRoot);
      writeIosIcons(mod.modRequest.projectRoot, appDir, alternates, forced);
      return mod;
    },
  ]);
  config = withXcodeProject(config, (mod) => {
    const projectName = mod.modRequest.projectName;
    if (!projectName) throw new Error('with-app-icons: no iOS project name');
    const names = [
      ...automaticAlternateIds(alternates),
      ...forcedAlternateNames(forced, alternates),
    ].join(' ');
    // The `xcode` package ships no types: read its project object through PbxProject.
    const project: unknown = mod.modResults;
    // A file already in the group is left alone, so prebuilds stay idempotent. `never`: the
    // helper's own parameter type comes from the untyped package too.
    for (const id of iconComposerAlternateIds(alternates)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${id}.icon`,
        groupName: projectName,
        project: project as never,
        isBuildFile: true,
      });
    }
    for (const settings of appTargetBuildSettings(project as PbxProject, projectName)) {
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
    mod.modResults = applyIconAliases(mod.modResults, alternates);
    return mod;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withAppIcons;
