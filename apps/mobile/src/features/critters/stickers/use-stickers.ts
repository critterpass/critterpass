/**
 * The traveller's stickers from the local database: their own rows ride the `me` stream, their
 * crews' crew-wide rows ride `crews`, so the shelf works offline and a new sticker appears live.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows, useOwnerUid } from '../quests/live-rows';
import { shelfItems, type ShelfItem, type StickerRow } from './sticker-model';

const STICKERS_SQL = `
  SELECT s.id, s.user_id, s.crew_id, s.trip_id, s.kind, s.level, s.granted_at,
         c.name AS crew_name, d.name AS place, g.slug AS guide_slug
    FROM stickers s
    LEFT JOIN crews c ON c.id = s.crew_id
    LEFT JOIN trips t ON t.id = s.trip_id
    LEFT JOIN destinations d ON d.id = t.destination_id
    LEFT JOIN guides g ON g.id = t.guide_id
   ORDER BY s.granted_at DESC`;
const TABLES = ['stickers', 'crews', 'trips', 'destinations', 'guides'] as const;

export function useStickers(): { readonly items: readonly ShelfItem[]; readonly loaded: boolean } {
  const viewerId = useOwnerUid();
  const { rows, loaded } = useLiveRows<StickerRow>(STICKERS_SQL, [], TABLES);
  const items = useMemo(() => shelfItems(rows, viewerId), [rows, viewerId]);
  return { items, loaded };
}
