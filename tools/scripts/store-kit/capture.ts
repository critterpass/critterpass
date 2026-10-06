/**
 * Raw store captures. The capture flows (`e2e/store-shots/<locale>/shots.yaml`) run on a GitHub
 * Actions device run, never on this machine; this script names what a run must produce, starts
 * the run, and files a downloaded run's screenshots where the compositor reads them.
 *
 *   pnpm tsx tools/scripts/store-kit/capture.ts --platform android [--locale en,vi]
 *       prints the device run to start (add --dispatch --ref <branch> --build-url <apk> to start it)
 *   pnpm tsx tools/scripts/store-kit/capture.ts --platform android --collect <artifact dir>
 *       copies store-<locale>-<shot>.png into apps/mobile/store/raw/<platform>/<locale>/<shot>.png
 *       and fails with the list of captures the run did not produce
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { shotLocales, storeListings, storeShotTemplates } from '@cp/content/store';
import type { AppLocale } from '@cp/domain';

import { CAPTURE_PLATFORMS, type CapturePlatform } from './devices';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const STORE_OUT = path.join(REPO_ROOT, 'apps/mobile/store');

/** The screenshot a flow takes for one shot in one language. */
export function captureName(locale: string, shot: string): string {
  return `store-${locale}-${shot}`;
}

/** Where a filed raw capture lives under the store output folder. */
export function rawPath(root: string, platform: string, locale: string, shot: string): string {
  return path.join(root, 'raw', platform, locale, `${shot}.png`);
}

export function flowFiles(locales: readonly string[]): string[] {
  return locales.map((locale) => `e2e/store-shots/${locale}/shots.yaml`);
}

/** `gh` arguments for the device run that captures these languages on one platform. */
export function dispatchArgs(run: {
  readonly platform: CapturePlatform;
  readonly locales: readonly string[];
  readonly ref: string;
  readonly buildUrl?: string;
}): string[] {
  if (run.platform === 'android' && run.buildUrl === undefined) {
    throw new Error('--build-url: an Android run needs the e2e-test APK to install');
  }
  return [
    'workflow',
    'run',
    'device.yml',
    '--ref',
    run.ref,
    '-f',
    `platform=${run.platform}`,
    ...(run.buildUrl !== undefined ? ['-f', `build_url=${run.buildUrl}`] : []),
    '-f',
    `flows=${flowFiles(run.locales).join(' ')}`,
    '-f',
    'mode=capture',
    '-f',
    'shards=1',
  ];
}

export interface Collected {
  readonly filed: readonly string[];
  readonly missing: readonly string[];
}

function pngsUnder(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue;
    const name = entry.name.slice(0, -'.png'.length);
    const file = path.join(entry.parentPath, entry.name);
    const earlier = found.get(name);
    if (earlier !== undefined) {
      throw new Error(`${name}.png is in the run twice: ${earlier} and ${file}`);
    }
    found.set(name, file);
  }
  return found;
}

/** Files a downloaded run's captures under `out`; lists every capture the run lacks. */
export function collect(args: {
  readonly artifactDir: string;
  readonly out: string;
  readonly platform: CapturePlatform;
  readonly locales: readonly string[];
  readonly shots: readonly string[];
}): Collected {
  const found = pngsUnder(args.artifactDir);
  const filed: string[] = [];
  const missing: string[] = [];
  for (const locale of args.locales) {
    for (const shot of args.shots) {
      const name = captureName(locale, shot);
      const source = found.get(name);
      if (source === undefined) {
        missing.push(`${name}.png`);
        continue;
      }
      const target = rawPath(args.out, args.platform, locale, shot);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
      filed.push(target);
    }
  }
  return { filed, missing };
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      platform: { type: 'string' },
      locale: { type: 'string' },
      collect: { type: 'string' },
      out: { type: 'string', default: STORE_OUT },
      dispatch: { type: 'boolean', default: false },
      ref: { type: 'string', default: 'main' },
      'build-url': { type: 'string' },
    },
  });
  const platform = CAPTURE_PLATFORMS.find((candidate) => candidate === values.platform);
  if (platform === undefined) throw new Error('--platform must be ios or android');
  const templates = storeShotTemplates();
  const listed = Object.keys(storeListings()) as AppLocale[];
  const locales = shotLocales(templates, listed, values.locale?.split(',').filter(Boolean));
  const shots = templates.map((template) => template.id);

  if (values.collect !== undefined) {
    const result = collect({
      artifactDir: values.collect,
      out: values.out,
      platform,
      locales,
      shots,
    });
    console.log(`filed ${String(result.filed.length)} captures under ${values.out}`);
    if (result.missing.length > 0) {
      throw new Error(`the run has no:\n- ${result.missing.join('\n- ')}`);
    }
    return;
  }
  const args = dispatchArgs({
    platform,
    locales,
    ref: values.ref,
    ...(values['build-url'] !== undefined ? { buildUrl: values['build-url'] } : {}),
  });
  if (values.dispatch) {
    execFileSync('gh', args, { stdio: 'inherit' });
    return;
  }
  console.log(`gh ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`);
  for (const locale of locales) {
    for (const shot of shots) console.log(`  expects ${captureName(locale, shot)}.png`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
