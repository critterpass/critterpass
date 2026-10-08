/** The dex list's rows: place sets under their rank-group headings. */
import { rankGroup } from './dex-copy';
import type { SetModel } from './dex-model';

export type Item =
  | { readonly kind: 'group'; readonly key: string; readonly label: string }
  | { readonly kind: 'set'; readonly key: string; readonly set: SetModel };

/** Place sets in rank groups of ten ("Rank 1–10 · five cities each"), unranked last. */
export function withGroups(sets: readonly SetModel[], grouped: boolean): Item[] {
  const items: Item[] = [];
  let group = -1;
  for (const set of sets) {
    const g = set.rank === null ? Number.MAX_SAFE_INTEGER : Math.floor((set.rank - 1) / 10);
    if (grouped && g !== group && set.rank !== null) {
      group = g;
      const members = sets.filter((s) => s.rank !== null && Math.floor((s.rank - 1) / 10) === g);
      const sizes = new Set(members.map((s) => s.total));
      const [only] = [...sizes];
      items.push({
        kind: 'group',
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a list key, never copy.
        key: `group-${g}`,
        label: rankGroup(g * 10 + 1, g * 10 + 10, sizes.size === 1 ? (only ?? null) : null),
      });
    }
    items.push({ kind: 'set', key: set.id, set });
  }
  return items;
}
