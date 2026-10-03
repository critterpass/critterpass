/** The order and rings of the forms a person may wear (pure, for tests). */
import type { AvatarRing } from './member-face';

export interface OwnedForm {
  /** The catalogue key `set_avatar` takes. */
  readonly key: string;
  readonly ring: AvatarRing | null;
}

const RANK: Readonly<Record<string, number>> = { legendary: 0, epic: 1, rare: 2 };

export function ownedFormsOf(rows: readonly { key: string; rarity: string }[]): OwnedForm[] {
  return [...rows]
    .sort((a, b) => (RANK[a.rarity] ?? 3) - (RANK[b.rarity] ?? 3) || a.key.localeCompare(b.key))
    .map((row) => ({
      key: row.key,
      ring:
        row.rarity === 'rare' || row.rarity === 'epic' || row.rarity === 'legendary'
          ? row.rarity
          : null,
    }));
}
