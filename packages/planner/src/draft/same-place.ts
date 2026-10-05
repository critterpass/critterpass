/**
 * One place, several rows. The curated set lists some places more than once ("Chùa Linh Ứng (Linh
 * Ung Pagoda)" and "Linh Ứng Pagoda"; "Hải Vân Pass" four times), and the guide must not be
 * offered the same place twice. Two rows are the same place when they sit within about 150 m of
 * each other and their names overlap, or when they carry the same name (exactly, or once kind
 * words and short forms are evened out, within a few kilometres) and are not food
 * (a chain has many branches; a mountain pass has one). The row kept is a must-do's own place,
 * else the must-see one, else the better described, else the plainest name ("Marble Mountains"
 * before "Marble Mountains Elevator"), else the one nearest the others (a stray pin is the
 * likelier mistake), else the first by id. How many rows named a
 * place is kept: the places a set lists three times are the ones everybody goes to.
 */
import { nameAliases } from './place-names';
import type { DraftPoi } from './types';

const SAME_PLACE_M = 150;
const NAME_OVERLAP = 0.6;

export function metresBetween(
  a: Pick<DraftPoi, 'lat' | 'lng'>,
  b: Pick<DraftPoi, 'lat' | 'lng'>,
): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

interface Named {
  readonly poi: DraftPoi;
  /** Every name the row carries as its own, each as one string. */
  readonly names: readonly string[];
  readonly tokens: ReadonlySet<string>;
  /** The leading name without kind words, short forms spelt out; null under two words. */
  readonly core: string | null;
}

const LOOKALIKE_M = 8000;
/** Words that say what kind of place a sight is, in the languages our rows use. */
const KIND_WORDS: ReadonlySet<string> = new Set([
  'the',
  'pura',
  'candi',
  'temple',
  'shrine',
  'chua',
  'pagoda',
  'church',
]);
const SHORT_FORMS: Readonly<Record<string, string>> = { gn: 'gunung', mt: 'mount' };

function coreName(alias: readonly string[] | undefined): string | null {
  const words = (alias ?? [])
    .map((word) => SHORT_FORMS[word] ?? word)
    .filter((word) => !KIND_WORDS.has(word));
  return words.length < 2 ? null : words.join(' ');
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function samePlace(a: Named, b: Named): boolean {
  if (a.poi.category !== 'food' && b.poi.category !== 'food') {
    if (a.names.some((name) => b.names.includes(name))) return true;
    // "Gn Kawi Temple" and "Pura Gunung Kawi": one name once the word for the kind of place is
    // off and the short forms are spelt out. Nobody visits both on one trip.
    const near = metresBetween(a.poi, b.poi) <= LOOKALIKE_M;
    if (near && a.core !== null && a.core === b.core) return true;
  }
  return metresBetween(a.poi, b.poi) <= SAME_PLACE_M && overlap(a.tokens, b.tokens) >= NAME_OVERLAP;
}

export interface Collapsed {
  /** One row per place, in the order the rows came. */
  readonly kept: readonly DraftPoi[];
  /** Rows that named each kept place (1 = listed once). */
  readonly mentions: ReadonlyMap<string, number>;
  /** Every row's kept row (itself when it was kept). */
  readonly keptFor: ReadonlyMap<string, string>;
}

export function collapseSamePlaces(
  pois: readonly DraftPoi[],
  options: {
    /** Rows that stand for their place whatever else names it (a must-do's own place). */
    readonly keep?: ReadonlySet<string>;
    readonly ignore?: readonly (readonly string[])[];
  } = {},
): Collapsed {
  const keep = options.keep ?? new Set<string>();
  const named: Named[] = pois.map((poi) => {
    const aliases = nameAliases(poi.name, options.ignore ?? []).primary;
    return {
      poi,
      names: aliases.filter((alias) => alias.length >= 2).map((alias) => alias.join(' ')),
      tokens: new Set(aliases.flat()),
      core: coreName(aliases[0]),
    };
  });
  const parent = named.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] as number;
    parent[index] = root;
    return root;
  };
  for (let a = 0; a < named.length; a += 1) {
    for (let b = a + 1; b < named.length; b += 1) {
      const [ra, rb] = [find(a), find(b)];
      if (ra !== rb && samePlace(named[a] as Named, named[b] as Named)) parent[rb] = ra;
    }
  }
  const groups = new Map<number, DraftPoi[]>();
  named.forEach((entry, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), entry.poi]);
  });
  const better = (rows: readonly DraftPoi[]) => {
    const apart = new Map(
      rows.map((poi) => [
        poi.id,
        Math.round(rows.reduce((sum, other) => sum + metresBetween(poi, other), 0)),
      ]),
    );
    const words = new Map(named.map((entry) => [entry.poi.id, entry.tokens.size]));
    return (a: DraftPoi, b: DraftPoi): number =>
      Number(keep.has(b.id)) - Number(keep.has(a.id)) ||
      Number(b.mustSee) - Number(a.mustSee) ||
      Number(b.editorial) - Number(a.editorial) ||
      (b.detail ?? 0) - (a.detail ?? 0) ||
      (words.get(a.id) ?? 0) - (words.get(b.id) ?? 0) ||
      (apart.get(a.id) ?? 0) - (apart.get(b.id) ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  const keptFor = new Map<string, string>();
  const mentions = new Map<string, number>();
  const kept = new Set<string>();
  for (const rows of groups.values()) {
    const sorted = [...rows].sort(better(rows));
    // Two must-dos' own places are both kept even when they are one place.
    const heads = sorted.filter((poi, index) => index === 0 || keep.has(poi.id));
    const head = heads[0] as DraftPoi;
    for (const poi of heads) {
      kept.add(poi.id);
      keptFor.set(poi.id, poi.id);
      mentions.set(poi.id, rows.length);
    }
    for (const poi of sorted) if (!kept.has(poi.id)) keptFor.set(poi.id, head.id);
  }
  return { kept: pois.filter((poi) => kept.has(poi.id)), mentions, keptFor };
}

/** A row this close to another, carrying its name, is the same spot under another listing. */
const TWIN_M = 100;
const FILLER: ReadonlySet<string> = new Set(['the', 'a', 'an']);

/**
 * The row a must-do picked from search is planned at. Search can hand back a stay or a shop that
 * shares a sight's name and doorstep ("The Crazy House", filed as a guesthouse, beside the villa
 * everybody means). When a recommended row (curated, or one of the destination's well-known
 * picks) sits on the same spot and carries every word of the picked row's name, the stop goes
 * there; a row that is itself recommended is never swapped.
 */
export function knownPlaceFor(
  own: DraftPoi,
  places: readonly DraftPoi[],
  ignore: readonly (readonly string[])[] = [],
): DraftPoi {
  if (own.editorial || own.mustSee) return own;
  const words = (poi: DraftPoi) => {
    const aliases = nameAliases(poi.name, ignore);
    return new Set([...aliases.primary, ...aliases.secondary].flat());
  };
  const mine = [...words(own)].filter((word) => !FILLER.has(word));
  if (mine.length === 0) return own;
  const twins = places.filter((poi) => {
    if (poi.id === own.id || !(poi.editorial || poi.mustSee)) return false;
    if (poi.category === 'stay' || poi.category === 'transit') return false;
    if (metresBetween(own, poi) > TWIN_M) return false;
    const theirs = words(poi);
    return mine.every((word) => theirs.has(word));
  });
  twins.sort(
    (a, b) =>
      Number(b.mustSee) - Number(a.mustSee) ||
      Number(b.editorial) - Number(a.editorial) ||
      (b.detail ?? 0) - (a.detail ?? 0) ||
      (a.id < b.id ? -1 : 1),
  );
  return twins[0] ?? own;
}
