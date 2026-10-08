/**
 * The trip hub's PHOTOS tile: how many photos the crew's album holds and how many are picks,
 * opening the album (3m-2). It is there from the first day, so photos can go up during the trip
 * (undesigned: the hub render shows no album tile; it is built from the hub's own tile).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and keys, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLiveRows } from '@/data/powersync/live-rows';
import { HubTile, registerHubTile, type HubTileProps } from '@/features/trip';
import { useScreenHref } from '@/lib/navigation/screen-registry';

const COUNT_SQL = `
  SELECT count(*) AS photos, coalesce(sum(is_pick), 0) AS picks
    FROM photos WHERE trip_id = ? AND deleted_at IS NULL`;
const TABLES = ['photos'] as const;

export function AlbumTile({ tripId }: HubTileProps) {
  const { t } = useLingui();
  const album = useScreenHref('3m-2', { tripId });
  const row = useLiveRows<{ photos: number; picks: number }>(COUNT_SQL, [tripId], TABLES).rows[0];
  const photos = row?.photos ?? 0;
  const picks = row?.picks ?? 0;
  return (
    <HubTile
      tile={{
        key: 'album',
        title: t({ id: 'album.title', message: 'Photos' }),
        value:
          photos === 0
            ? t({ id: 'album.tile.none', message: 'Add' })
            : t({
                id: 'album.tile.count',
                message: plural(photos, { one: '# photo', other: '# photos' }),
              }),
        caption:
          photos === 0
            ? t({ id: 'album.tile.first', message: 'the whole crew sees them' })
            : picks > 0
              ? t({
                  id: 'album.tile.picks',
                  message: plural(picks, { one: '# pick', other: '# picks' }),
                })
              : t({ id: 'album.tile.crew', message: "the crew's album" }),
        icon: 'camera',
        tone: 'yellow',
        ...(album === undefined ? {} : { onPress: () => router.push(album) }),
      }}
    />
  );
}

/** Joins the hub after PLAN, BOOKINGS, MONEY and QUESTS. */
export function registerAlbumHubTile(): void {
  registerHubTile({ key: 'album', order: 50, Tile: AlbumTile });
}
