import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ANDROID_PERMISSIONS,
  FULL_ACCURACY_PURPOSE_KEY,
  IOS_PLIST_FLAGS,
  IOS_USAGE_KEYS,
} from '@cp/domain';

/**
 * After `npx expo prebuild --no-install` in apps/mobile, checks the generated native projects
 * carry every permission the app primes: each iOS usage string present and non-empty (plus the
 * temporary full-accuracy purpose, the background location mode and the Live Activity flags), and
 * each Android permission declared.
 *
 *   pnpm tsx tools/scripts/check-permissions-manifest.ts
 */
const MOBILE_DIR = path.resolve(import.meta.dirname, '../../apps/mobile');

/** The `<string>` value right after `<key>name</key>`, or undefined. */
function plistString(plist: string, key: string): string | undefined {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`).exec(plist);
  return match?.[1];
}

export function checkInfoPlist(plist: string): string[] {
  const problems: string[] = [];
  for (const key of IOS_USAGE_KEYS) {
    const value = plistString(plist, key);
    if (value === undefined || value.trim() === '') problems.push(`ios: ${key} missing or empty`);
  }
  const temporary =
    /<key>NSLocationTemporaryUsageDescriptionDictionary<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(
      plist,
    );
  if (
    temporary?.[1] === undefined ||
    plistString(temporary[1], FULL_ACCURACY_PURPOSE_KEY) === undefined
  ) {
    problems.push(`ios: temporary full-accuracy purpose ${FULL_ACCURACY_PURPOSE_KEY} missing`);
  }
  for (const flag of IOS_PLIST_FLAGS) {
    if (!new RegExp(`<key>${flag}</key>\\s*<true/>`).test(plist))
      problems.push(`ios: ${flag} not true`);
  }
  const modes = /<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
  if (!modes.includes('<string>location</string>')) {
    problems.push('ios: UIBackgroundModes lacks location');
  }
  return problems;
}

export function checkAndroidManifest(manifest: string): string[] {
  return ANDROID_PERMISSIONS.filter(
    (name) => !new RegExp(`<uses-permission[^>]*android:name="${name}"`).test(manifest),
  ).map((name) => `android: ${name} not declared`);
}

function findInfoPlist(): string | undefined {
  const iosDir = path.join(MOBILE_DIR, 'ios');
  if (!existsSync(iosDir)) return undefined;
  for (const entry of readdirSync(iosDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'Pods') continue;
    const candidate = path.join(iosDir, entry.name, 'Info.plist');
    if (existsSync(candidate) && readFileSync(candidate, 'utf8').includes('CFBundleIdentifier')) {
      return candidate;
    }
  }
  return undefined;
}

function main(): void {
  const plistPath = findInfoPlist();
  const manifestPath = path.join(MOBILE_DIR, 'android/app/src/main/AndroidManifest.xml');
  if (plistPath === undefined || !existsSync(manifestPath)) {
    throw new Error('run `npx expo prebuild --no-install` in apps/mobile first');
  }
  const problems = [
    ...checkInfoPlist(readFileSync(plistPath, 'utf8')),
    ...checkAndroidManifest(readFileSync(manifestPath, 'utf8')),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('permissions manifest ok');
}

if (process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
