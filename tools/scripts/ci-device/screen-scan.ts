/**
 * Runs the pixel checks (./screen-checks) over a folder of device screenshots.
 *
 *   tsx tools/scripts/ci-device/screen-scan.ts <screenshots dir> [--out <dir>]
 *
 * Writes `<out>/screen-checks.log` (empty when clean) and exits non-zero on any finding. The device
 * shards call `scanScreenshots` after their flows, like the `[ui-qa]` scan.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { decodePng } from './png';
import { checkScreen, parseHex, type Rgb, type ScreenFinding } from './screen-checks';
import { isSparseByDesign } from './sparse-by-design';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const TOKENS = path.join(REPO_ROOT, 'packages/design-tokens/src');
export const SCREEN_CHECKS_LOG = 'screen-checks.log';

type TokenTree = { readonly [key: string]: TokenTree | string | undefined };

function lookup(tree: TokenTree, dotted: string): string | undefined {
  let node: TokenTree | string | undefined = tree;
  for (const key of dotted.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[key];
  }
  if (node === undefined || typeof node === 'string') return node;
  const value = node.$value;
  return typeof value === 'string' ? value : undefined;
}

/** `semantic.bg.base` resolved through its `{color.…}` reference, from the design tokens. */
export function appBackground(tokensDir = TOKENS): Rgb {
  const read = (file: string) =>
    JSON.parse(readFileSync(path.join(tokensDir, file), 'utf8')) as TokenTree;
  const tree: TokenTree = { ...read('color.tokens.json'), ...read('semantic.tokens.json') };
  let value = lookup(tree, 'semantic.bg.base');
  for (let depth = 0; value?.startsWith('{') && depth < 5; depth += 1) {
    value = lookup(tree, value.slice(1, -1));
  }
  if (!value) throw new Error('semantic.bg.base is not in the design tokens');
  return parseHex(value);
}

/** Findings per screenshot name (without `.png`), for the screenshots that have any. */
export function scanScreenshots(dir: string, background: Rgb): Map<string, ScreenFinding[]> {
  const byShot = new Map<string, ScreenFinding[]>();
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.png'))
    .sort();
  for (const file of files) {
    const shot = file.slice(0, -'.png'.length);
    const findings = checkScreen(decodePng(readFileSync(path.join(dir, file))), {
      background,
      sparseByDesign: isSparseByDesign(shot),
    });
    if (findings.length > 0) byShot.set(shot, findings);
  }
  return byShot;
}

export function formatFindings(byShot: ReadonlyMap<string, readonly ScreenFinding[]>): string {
  return [...byShot]
    .flatMap(([shot, findings]) => findings.map((f) => `${shot}: ${f.code} ${f.detail}`))
    .join('\n');
}

/** Writes `<out>/screen-checks.log` and returns its text (empty when every screen passed). */
export function writeFindings(
  byShot: ReadonlyMap<string, readonly ScreenFinding[]>,
  out: string,
): string {
  const text = formatFindings(byShot);
  writeFileSync(path.join(out, SCREEN_CHECKS_LOG), text ? `${text}\n` : '');
  return text;
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: { out: { type: 'string' } },
  });
  const dir = positionals[0];
  if (!dir) throw new Error('Usage: screen-scan <screenshots dir> [--out <dir>]');
  const byShot = scanScreenshots(path.resolve(dir), appBackground());
  const text = values.out
    ? writeFindings(byShot, path.resolve(values.out))
    : formatFindings(byShot);
  if (!text) {
    console.log('screen checks: no findings');
    return;
  }
  console.error(`screen checks:\n${text}`);
  process.exitCode = 1;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
