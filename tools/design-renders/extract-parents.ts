/**
 * Generates apps/mobile/src/lib/navigation/parents.ts from the prototype's `PARENT` map
 * (design/Critterpass Prototype.dc.html): the screen a cold-opened screen's back button returns to.
 * The prototype keys screens by name; docs/design-renders/screens.json maps each name to its design
 * screen id. Screens the design dropped but the app still registers keep the parent they had, in a
 * `LEGACY_PARENTS` block carried over from the committed file. `--check` exits non-zero when the
 * committed file is stale instead of writing it.
 *
 *   pnpm tsx tools/design-renders/extract-parents.ts [--check]
 */
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const PROTOTYPE = path.join(ROOT, 'design/Critterpass Prototype.dc.html');
export const SCREENS = path.join(ROOT, 'docs/design-renders/screens.json');
export const OUTPUT = path.join(ROOT, 'apps/mobile/src/lib/navigation/parents.ts');

const SCREEN_ID_SUFFIX = / (\d[a-z]-\d+)$/;
const QUOTED = /(['"])((?:(?!\1).)*)\1/g;

type Entries = [string, string][];

function normaliseName(name: string): string {
  return name.replace(/’/g, "'").trim();
}

function section(id: string): string {
  return id.slice(0, id.indexOf('-'));
}

/** Parses the `PARENT = { 'Child': 'Parent', ... }` object literal out of the prototype source. */
export function parseParentMap(html: string): Map<string, string> {
  const start = html.indexOf('PARENT = {');
  if (start < 0) throw new Error('extract-parents: no PARENT map in the prototype');
  const end = html.indexOf('}', start);
  const body = html.slice(start, end + 1);
  const pairs = new Map<string, string>();
  const entry = /(['"])((?:(?!\1).)*)\1\s*:\s*(['"])((?:(?!\3).)*)\3/g;
  for (const match of body.matchAll(entry)) {
    const [, , child, , parent] = match;
    if (child !== undefined && parent !== undefined) pairs.set(child, parent);
  }
  return pairs;
}

/** Parses the `STATES = [['A', 'A, other state'], ...]` groups: names drawn as states of one screen. */
export function parseStateGroups(html: string): string[][] {
  const start = html.indexOf('STATES = [');
  if (start < 0) return [];
  const end = html.indexOf(']]', start);
  const body = html.slice(start + 'STATES = ['.length, end + 1);
  return [...body.matchAll(/\[([^\]]*)\]/g)].map((group) =>
    [...(group[1] ?? '').matchAll(QUOTED)].map((match) => match[2] ?? ''),
  );
}

function idsByLabelName(labels: readonly string[]): Map<string, string[]> {
  const idsByName = new Map<string, string[]>();
  for (const label of labels) {
    const space = label.indexOf(' ');
    const id = label.slice(0, space);
    const name = normaliseName(label.slice(space + 1));
    idsByName.set(name, [...(idsByName.get(name) ?? []), id]);
  }
  return idsByName;
}

/**
 * Resolves prototype names to screen ids. A name shared by two screens is either written with an
 * id suffix for one of them (`Budget 3i-6`), the bare name then meaning the other, or settled by
 * its `STATES` group: the screen in the same section as the group's other names. Anything still
 * ambiguous, or a name no screen has, fails.
 */
export function resolveIds(
  labels: readonly string[],
  names: Iterable<string>,
  groups: readonly string[][] = [],
): Map<string, string> {
  const idsByName = idsByLabelName(labels);
  const all = [...names];
  const claimed = new Set(all.flatMap((name) => SCREEN_ID_SUFFIX.exec(name)?.slice(1, 2) ?? []));
  const candidates = (name: string): string[] =>
    (idsByName.get(normaliseName(name)) ?? []).filter((id) => !claimed.has(id));
  const bySection = (name: string, ids: string[]): string[] => {
    const group = groups.find((states) => states.includes(name)) ?? [];
    const sections = new Set(
      group.flatMap((sibling) => {
        const siblingIds = sibling === name ? [] : candidates(sibling);
        return siblingIds.length === 1 && siblingIds[0] ? [section(siblingIds[0])] : [];
      }),
    );
    return ids.filter((id) => sections.has(section(id)));
  };
  const resolved = new Map<string, string>();
  for (const name of all) {
    const suffixed = SCREEN_ID_SUFFIX.exec(name)?.[1];
    if (suffixed) {
      resolved.set(name, suffixed);
      continue;
    }
    let ids = candidates(name);
    if (ids.length > 1) ids = bySection(name, ids);
    if (ids.length !== 1 || ids[0] === undefined) {
      const matches = candidates(name);
      throw new Error(
        `extract-parents: "${name}" matches ${matches.length} screens (${matches.join(', ')})`,
      );
    }
    resolved.set(name, ids[0]);
  }
  return resolved;
}

function byId([a]: [string, string], [b]: [string, string]): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function buildParents(html: string, labels: readonly string[]): Entries {
  const map = parseParentMap(html);
  const ids = resolveIds(labels, [...map.keys(), ...map.values()], parseStateGroups(html));
  const entries: Entries = [...map].map(([child, parent]) => [
    ids.get(child) ?? child,
    ids.get(parent) ?? parent,
  ]);
  return entries.sort(byId);
}

/** Every `'id': 'id'` pair in a committed parents.ts, legacy block included. */
export function parseCommitted(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/'(\d+[a-z]-\d+)':\s*'(\d+[a-z]-\d+)'/g)].map(
      ([, child = '', parent = '']) => [child, parent],
    ),
  );
}

/** Design ids the app registers with the screen registry (`'3b-4': HOME_ROUTES.inbox`, …). */
export function registeredIds(root: string): Set<string> {
  const files = globSync('apps/mobile/src/features/**/*.ts', { cwd: root }).filter(
    (file) => !/__tests__|\.test\.ts$|test-support/.test(file),
  );
  const ids = new Set<string>();
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/'(\d+[a-z]-\d+)'\s*:\s*(?:\w*ROUTES\.|'\/|\(|\w+Route)/g))
      ids.add(match[1] ?? '');
  }
  return ids;
}

/** Parents of screens the design dropped that the app still registers, as last generated. */
export function legacyParents(
  committed: ReadonlyMap<string, string>,
  labels: readonly string[],
  registered: ReadonlySet<string>,
): Entries {
  const designed = new Set(labels.map((label) => label.slice(0, label.indexOf(' '))));
  return [...committed]
    .filter(([child]) => !designed.has(child) && registered.has(child))
    .sort(byId);
}

export async function render(entries: Entries, legacy: Entries): Promise<string> {
  const lines = (list: Entries) =>
    list.map(([child, parent]) => `  '${child}': '${parent}',`).join('\n');
  const source = `// Generated by tools/design-renders/extract-parents.ts from the prototype's PARENT map.
// Do not edit: run \`pnpm tsx tools/design-renders/extract-parents.ts\` after the design changes.

/** Screens the design no longer draws but the app still registers: the parent they last had. */
const LEGACY_PARENTS: Readonly<Record<string, string>> = {
${lines(legacy)}
};

/** Design screen id → the screen its back button returns to when opened cold. */
export const PARENTS: Readonly<Record<string, string>> = {
${lines(entries)}
  ...LEGACY_PARENTS,
};
`;
  const config = (await resolveConfig(OUTPUT)) ?? {};
  return format(source, { ...config, filepath: OUTPUT });
}

/** The parents.ts the current design and app registrations produce. */
export async function generate(committed: string): Promise<string> {
  const html = readFileSync(PROTOTYPE, 'utf8');
  const labels = (JSON.parse(readFileSync(SCREENS, 'utf8')) as { label: string }[]).map(
    (screen) => screen.label,
  );
  const legacy = legacyParents(parseCommitted(committed), labels, registeredIds(ROOT));
  return render(buildParents(html, labels), legacy);
}

async function main(): Promise<void> {
  const current = readFileSync(OUTPUT, 'utf8');
  const output = await generate(current);
  if (process.argv.includes('--check')) {
    if (current !== output) {
      console.error('parents.ts is stale: run pnpm tsx tools/design-renders/extract-parents.ts');
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(OUTPUT, output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
