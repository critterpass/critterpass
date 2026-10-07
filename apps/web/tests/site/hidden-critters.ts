/**
 * What the open web must never carry about a critter nobody has found yet: its name and its
 * species line, read from the catalogue source so the list stays current. The hand-drawn guides
 * are public characters (the site and every invite show them by name) and are listed here by hand:
 * adding one is a product decision, not a side effect of a catalogue change.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { critters, isGuideSpec } from '@cp/critter-art';

/** The guides the site shows by name. Every one must be a hand-drawn guide in the catalogue. */
export const PUBLIC_GUIDE_NAMES: readonly string[] = [
  'Tokek',
  'Pon',
  'Lundi',
  'Ajo',
  'Sardi',
  'Paco',
  'Chà Vá',
];

/**
 * The locals the coming-soon page hatches from its egg by name (`src/lib/hatch-pool.ts`): a
 * designed preview of the collection, shown to everyone. Every other local stays unnamed.
 */
export const PREVIEW_LOCAL_NAMES: readonly string[] = [
  'Chép',
  'Roucou',
  'Pizza',
  'Drac',
  'Cụ Rùa',
  'Lucky',
  'Lince',
  'Ngựa',
];

export interface HiddenCritter {
  readonly key: string;
  readonly num: string;
  readonly name: string;
  readonly species: string;
}

export function hiddenCritters(): readonly HiddenCritter[] {
  for (const name of PUBLIC_GUIDE_NAMES) {
    const critter = critters.find((entry) => entry.name === name);
    if (critter === undefined || !isGuideSpec(critter.spec)) {
      throw new Error(`hidden-critters: "${name}" is not a hand-drawn guide in the catalogue`);
    }
  }
  for (const name of PREVIEW_LOCAL_NAMES) {
    if (!critters.some((entry) => entry.name === name)) {
      throw new Error(`hidden-critters: "${name}" is not in the catalogue`);
    }
  }
  const shown = new Set([...PUBLIC_GUIDE_NAMES, ...PREVIEW_LOCAL_NAMES]);
  return critters
    .filter((critter) => !shown.has(critter.name))
    .map(({ id, num, name, species }) => ({ key: id, num, name, species }));
}

/**
 * A lone name can be an ordinary word or a city ("Pizza", "Faro"), so a name counts as a leak
 * where the text also says whose it is, or where names come as a list: its species line or
 * catalogue key within `IDENTITY_REACH` characters, or `NAME_LIST_SIZE` different names within
 * `NAME_LIST_REACH` characters.
 */
export const IDENTITY_REACH = 300;
export const NAME_LIST_SIZE = 5;
export const NAME_LIST_REACH = 1500;

export interface Leak {
  readonly file: string;
  /** Critters whose name sits next to their species line or catalogue key. */
  readonly identified: readonly string[];
  /** The names that come as a list. */
  readonly listed: readonly string[];
}

function wholeWords(terms: readonly string[]): RegExp {
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

/** A term in its own case and in capitals, as the boarding pass prints it. */
function bothCases(term: string): readonly string[] {
  return [...new Set([term, term.toLocaleUpperCase('en')])];
}

interface Matcher {
  readonly name: string;
  readonly names: RegExp;
  readonly identity: RegExp;
}

function matchers(): readonly Matcher[] {
  return hiddenCritters().map((critter) => ({
    name: critter.name,
    names: wholeWords(bothCases(critter.name)),
    // A species line that is the name itself ("Kiwi", "Puli") identifies nothing on its own.
    identity: wholeWords([
      ...(critter.species === critter.name ? [] : bothCases(critter.species)),
      critter.key,
      critter.num,
    ]),
  }));
}

let cached: readonly Matcher[] | null = null;

function positions(pattern: RegExp, text: string): readonly number[] {
  return [...text.matchAll(pattern)].map((match) => match.index);
}

interface NameHit {
  readonly name: string;
  readonly at: number;
}

function nameHits(text: string): readonly NameHit[] {
  cached ??= matchers();
  return cached
    .flatMap(({ name, names }) => positions(names, text).map((at) => ({ name, at })))
    .sort((a, b) => a.at - b.at);
}

function listedNames(hits: readonly NameHit[]): readonly string[] {
  const listed = new Set<string>();
  hits.forEach((first, start) => {
    const near = hits.slice(start).filter((hit) => hit.at - first.at <= NAME_LIST_REACH);
    const names = new Set(near.map((hit) => hit.name));
    if (names.size >= NAME_LIST_SIZE) for (const name of names) listed.add(name);
  });
  return [...listed];
}

/** The hidden critters a text gives away, or null when it gives none away. */
export function leakIn(file: string, text: string): Leak | null {
  const hits = nameHits(text);
  if (hits.length === 0) return null;
  const identified = (cached ?? []).filter((critter) => {
    const own = hits.filter((hit) => hit.name === critter.name);
    if (own.length === 0) return false;
    const marks = positions(critter.identity, text);
    return own.some((hit) => marks.some((mark) => Math.abs(mark - hit.at) <= IDENTITY_REACH));
  });
  const listed = listedNames(hits);
  if (identified.length === 0 && listed.length === 0) return null;
  return { file, identified: identified.map((critter) => critter.name), listed };
}

/** Every hidden name in a text, for a page that has no reason to carry even one. */
export function hiddenNamesIn(text: string): readonly string[] {
  return [...new Set(nameHits(text).map((hit) => hit.name))];
}

const TEXT_FILE = /\.(?:html|js|mjs|css|json|xml|txt|svg|map|webmanifest)$/u;

/** Every leak in the text files under `root` (a build's publicly served folder). */
export async function leaksUnder(root: string): Promise<readonly Leak[]> {
  const files = (await readdir(root, { recursive: true })).filter((file) => TEXT_FILE.test(file));
  const leaks: Leak[] = [];
  for (const file of files.sort()) {
    const leak = leakIn(relative(root, join(root, file)), await readFile(join(root, file), 'utf8'));
    if (leak !== null) leaks.push(leak);
  }
  return leaks;
}
