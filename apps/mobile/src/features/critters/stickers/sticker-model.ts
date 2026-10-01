/**
 * The sticker shelf as plain data: the traveller's own stickers (the Settled Tokek of each
 * trip settled) and their crews' crew-level stickers, newest first, each with what it is, how it
 * was earned, when and on which trip. Stickers are rewards, not critters: they come from the
 * `stickers` table alone, so they never reach the dex counts, the avatar picker or the app icons,
 * all of which read collection entries.
 */
/* eslint-disable lingui/no-unlocalized-strings -- sticker kinds, never copy. */

export interface StickerRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly kind: string;
  readonly level: number | null;
  readonly granted_at: string;
  readonly crew_name: string | null;
  readonly place: string | null;
  readonly guide_slug: string | null;
}

export type ShelfKind = 'settled' | 'crew_level' | 'special';

export interface ShelfItem {
  readonly id: string;
  readonly kind: ShelfKind;
  readonly level: number | null;
  readonly grantedAt: string;
  readonly crewName: string;
  readonly place: string;
  /** Whose art the sticker wears: Tokek for the Settled Tokek, the trip's guide otherwise. */
  readonly guide: string;
}

const KINDS: ReadonlySet<string> = new Set(['settled', 'crew_level', 'special']);

export function shelfItems(rows: readonly StickerRow[], viewerId: string | null): ShelfItem[] {
  return rows
    .filter((row) => KINDS.has(row.kind))
    .filter((row) => row.user_id === null || row.user_id === viewerId)
    .map((row): ShelfItem => ({
      id: row.id,
      kind: row.kind as ShelfKind,
      level: row.kind === 'crew_level' ? row.level : null,
      grantedAt: row.granted_at,
      crewName: row.crew_name ?? '',
      place: row.place ?? '',
      guide: row.kind === 'settled' ? 'tokek' : (row.guide_slug ?? 'tokek'),
    }))
    .sort((a, b) => (a.grantedAt < b.grantedAt ? 1 : a.grantedAt > b.grantedAt ? -1 : 0));
}
