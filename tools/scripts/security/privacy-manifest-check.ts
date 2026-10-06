/**
 * Privacy manifest check for the iOS app and its extensions, from source (no Xcode build):
 *
 *   pnpm tsx tools/scripts/security/privacy-manifest-check.ts [--json]
 *
 * Apple rejects uploads whose code calls a "required reason" API without declaring it in the
 * bundle's `PrivacyInfo.xcprivacy`. This finds the required-reason APIs our own Swift calls (the
 * local Expo modules compile into the app; each folder under apps/mobile/targets is its own
 * bundle), and compares them with what each bundle declares: the app through `ios.privacyManifests`
 * in the Expo config (or a prebuilt `ios/<App>/PrivacyInfo.xcprivacy`), an extension through a
 * `PrivacyInfo.xcprivacy` in its folder. Third-party pods ship their own manifests and are not
 * checked here. It fails on an undeclared category and on an app without a manifest; an extension
 * that calls none of these APIs and has no manifest is listed as a note.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_DIR = path.resolve(import.meta.dirname, '../../../apps/mobile');

/** Required-reason API categories and the calls that fall under them. */
export const REQUIRED_REASON_APIS: Readonly<Record<string, RegExp>> = {
  NSPrivacyAccessedAPICategoryUserDefaults: /\bUserDefaults\b/u,
  NSPrivacyAccessedAPICategorySystemBootTime: /\bsystemUptime\b|\bmach_absolute_time\b/u,
  NSPrivacyAccessedAPICategoryFileTimestamp:
    /\.creationDate\b|\.modificationDate\b|\bcontentModificationDate\b|\bcreationDateKey\b|\battributesOfItem\b|\bfstat\(|\bstat\(/u,
  NSPrivacyAccessedAPICategoryDiskSpace:
    /\bvolumeAvailableCapacity\w*|\bsystemFreeSize\b|\bsystemSize\b|\battributesOfFileSystem\b/u,
  NSPrivacyAccessedAPICategoryActiveKeyboards: /\bactiveInputModes\b/u,
};

/** The categories a set of Swift sources uses (comments are not stripped: a mention counts). */
export function usedCategories(sources: readonly string[]): string[] {
  return Object.entries(REQUIRED_REASON_APIS)
    .filter(([, pattern]) => sources.some((source) => pattern.test(source)))
    .map(([category]) => category);
}

/** Categories declared with at least one reason in an Expo `ios.privacyManifests` object. */
export function declaredInConfig(manifest: unknown): string[] {
  const types = (manifest as { NSPrivacyAccessedAPITypes?: unknown } | undefined)
    ?.NSPrivacyAccessedAPITypes;
  if (!Array.isArray(types)) return [];
  return types.flatMap((entry: unknown) => {
    const { NSPrivacyAccessedAPIType: type, NSPrivacyAccessedAPITypeReasons: reasons } =
      entry as Record<string, unknown>;
    return typeof type === 'string' && Array.isArray(reasons) && reasons.length > 0 ? [type] : [];
  });
}

/** Categories declared with at least one reason in a `PrivacyInfo.xcprivacy` plist. */
export function declaredInPlist(plist: string): string[] {
  const entry =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>(\w+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>/gu;
  const flipped =
    /<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>[\s\S]*?<\/array>\s*<key>NSPrivacyAccessedAPIType<\/key>\s*<string>(\w+)<\/string>/gu;
  return [...plist.matchAll(entry), ...plist.matchAll(flipped)].map((m) => m[1] ?? '');
}

export interface BundleInput {
  readonly name: string;
  readonly kind: 'app' | 'extension';
  readonly used: readonly string[];
  /** Declared categories; undefined when the bundle has no manifest at all. */
  readonly declared: readonly string[] | undefined;
}

export interface BundleResult extends BundleInput {
  readonly problems: readonly string[];
  readonly notes: readonly string[];
}

export function checkBundle(bundle: BundleInput): BundleResult {
  const problems: string[] = [];
  const notes: string[] = [];
  if (bundle.declared === undefined) {
    if (bundle.kind === 'app') problems.push('no privacy manifest');
    else if (bundle.used.length === 0) {
      notes.push('no privacy manifest (calls no required-reason API)');
    }
  }
  for (const category of bundle.used) {
    if (!bundle.declared?.includes(category)) problems.push(`${category} used but not declared`);
  }
  return { ...bundle, problems, notes };
}

function swiftSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Unit tests and build output are not part of the shipped bundle.
      return ['Tests', 'build', 'node_modules'].includes(entry.name) ? [] : swiftSources(full);
    }
    return entry.name.endsWith('.swift') ? [readFileSync(full, 'utf8')] : [];
  });
}

function findFile(dir: string, name: string, depth = 2): string | undefined {
  if (!existsSync(dir)) return undefined;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory() && depth > 0 && entry.name !== 'Pods') {
      const found = findFile(full, name, depth - 1);
      if (found) return found;
    }
  }
  return undefined;
}

function expoConfig(): { ios?: { privacyManifests?: unknown } } {
  const result = spawnSync('pnpm', ['exec', 'expo', 'config', '--json', '--type', 'public'], {
    cwd: MOBILE_DIR,
    encoding: 'utf8',
    env: { ...process.env, APP_VARIANT: 'production' },
  });
  if (result.status !== 0) throw new Error(`expo config failed: ${result.stderr.slice(0, 400)}`);
  return JSON.parse(result.stdout) as { ios?: { privacyManifests?: unknown } };
}

function appDeclared(): readonly string[] | undefined {
  const prebuilt = findFile(path.join(MOBILE_DIR, 'ios'), 'PrivacyInfo.xcprivacy');
  if (prebuilt) return declaredInPlist(readFileSync(prebuilt, 'utf8'));
  const manifest = expoConfig().ios?.privacyManifests;
  return manifest === undefined ? undefined : declaredInConfig(manifest);
}

function main(): void {
  const targetsDir = path.join(MOBILE_DIR, 'targets');
  const shared = swiftSources(path.join(targetsDir, '_shared'));
  const modules = swiftSources(path.join(MOBILE_DIR, 'modules'));
  const bundles: BundleInput[] = [
    { name: 'app', kind: 'app', used: usedCategories(modules), declared: appDeclared() },
    ...readdirSync(targetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry): BundleInput => {
        const dir = path.join(targetsDir, entry.name);
        const manifest = findFile(dir, 'PrivacyInfo.xcprivacy', 0);
        return {
          name: entry.name,
          kind: 'extension',
          // Shared sources are compiled into every target that lists them; counting them for all
          // targets errs on the side of asking for a declaration.
          used: usedCategories([...swiftSources(dir), ...shared]),
          declared: manifest ? declaredInPlist(readFileSync(manifest, 'utf8')) : undefined,
        };
      }),
  ];
  const results = bundles.map(checkBundle);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    for (const r of results) {
      const state = r.declared === undefined ? 'no manifest' : `declares ${r.declared.length}`;
      console.log(`${r.name} (${r.kind}): uses ${r.used.join(', ') || 'none'}; ${state}`);
      for (const problem of r.problems) console.log(`  problem: ${problem}`);
      for (const note of r.notes) console.log(`  note: ${note}`);
    }
  }
  process.exitCode = results.some((r) => r.problems.length > 0) ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
