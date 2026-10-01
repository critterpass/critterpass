/**
 * One place, several rows. The curated set lists some places more than once ("Chùa Linh Ứng (Linh
 * Ung Pagoda)" and "Linh Ứng Pagoda"; "Hải Vân Pass" four times), and the guide must not be
 * offered the same place twice. Two rows are the same place when they sit within about 150 m of
 * each other and their names overlap, or when they carry exactly the same name and are not food
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

function metresBetween(a: DraftPoi, b: DraftPoi): number {
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
