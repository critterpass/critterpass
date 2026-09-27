import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  APP_LINK_PATH_PREFIXES,
  LINK_ENVIRONMENTS,
  linkHostsFor,
  type LinkEnvironment,
} from '@cp/domain';

/**
 * After `npx expo prebuild --no-install` in apps/mobile, checks the generated native projects
 * claim this variant's link hosts: the iOS entitlements list `applinks:` for both hosts, and the
 * Android manifest has an `autoVerify` https intent filter for every link path on both hosts.
 *
 *   APP_VARIANT=staging pnpm tsx tools/scripts/check-links-manifest.ts
 */
const MOBILE_DIR = path.resolve(import.meta.dirname, '../../apps/mobile');

export function checkEntitlements(plist: string, env: LinkEnvironment): string[] {
  const suffix = env === 'development' ? '?mode=developer' : '';
  return linkHostsFor(env).flatMap((host) => {
    const entry = `<string>applinks:${host}${suffix}</string>`;
    return plist.includes(entry) ? [] : [`ios: entitlements lack applinks:${host}${suffix}`];
  });
}

/** Intent filters of the manifest, as raw XML blocks. */
function intentFilters(manifest: string): string[] {
  return [...manifest.matchAll(/<intent-filter\b[\s\S]*?<\/intent-filter>/g)].map((m) => m[0]);
}

export function checkManifest(manifest: string, env: LinkEnvironment): string[] {
  const verified = intentFilters(manifest).filter((filter) =>
    /android:autoVerify="true"/.test(filter),
  );
  return APP_LINK_PATH_PREFIXES.flatMap((prefix) => {
    const filter = verified.find((candidate) =>
      candidate.includes(`android:pathPrefix="/${prefix}/"`),
    );
    if (filter === undefined) return [`android: no autoVerify filter for /${prefix}/`];
    const missing = linkHostsFor(env).filter((host) => !filter.includes(`android:host="${host}"`));
    const problems = missing.map((host) => `android: /${prefix}/ filter lacks host ${host}`);
    if (!filter.includes('android:scheme="https"')) {
      problems.push(`android: /${prefix}/ filter is not https`);
    }
    return problems;
  });
}

function findEntitlements(): string | undefined {
  const iosDir = path.join(MOBILE_DIR, 'ios');
  if (!existsSync(iosDir)) return undefined;
  for (const entry of readdirSync(iosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(iosDir, entry.name);
    const file = readdirSync(dir).find((name) => name.endsWith('.entitlements'));
    if (file !== undefined) return path.join(dir, file);
  }
  return undefined;
}

function main(): void {
  const raw = process.env.APP_VARIANT ?? 'development';
  if (!(LINK_ENVIRONMENTS as readonly string[]).includes(raw)) {
    throw new Error(`APP_VARIANT must be one of ${LINK_ENVIRONMENTS.join(', ')}`);
  }
  const env = raw as LinkEnvironment;
  const entitlements = findEntitlements();
  const manifestPath = path.join(MOBILE_DIR, 'android/app/src/main/AndroidManifest.xml');
  const problems = [
    ...(entitlements === undefined
      ? ['ios: no .entitlements file (run `npx expo prebuild --no-install` first)']
      : checkEntitlements(readFileSync(entitlements, 'utf8'), env)),
    ...(existsSync(manifestPath)
      ? checkManifest(readFileSync(manifestPath, 'utf8'), env)
      : ['android: no AndroidManifest.xml (run `npx expo prebuild --no-install` first)']),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`link claims ok for ${env}`);
}

if (process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
