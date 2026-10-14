/**
 * The phone's places for what was typed with no signal (7i-2), worded for search:
 * walking minutes from you (or from where the search was opened), "open, as of" from the last
 * sync, and whether the crew saved it.
 */
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { TripPlaceSearch } from '@/data/places/use-trip-place-search';
import { useSyncStatus } from '@/data/status/use-sync-status';

import { useMyPosition } from '../hooks/use-my-position';
import { openBySyncedHours, walkMinutes, type LatLng } from './offline-model';

import type { SearchTrip } from './use-search-trip';

export function useOfflineRows(search: TripPlaceSearch, trip: SearchTrip, from: LatLng | null) {
  const { i18n } = useLingui();
  const position = useMyPosition();
  const sync = useSyncStatus();
  const here = position.kind === 'at' ? position.point : from;
  const syncedOn =
    sync.lastSyncedAt === null
      ? null
      : // The app's date formatter writes English days first ("12 Oct"); the Date method doesn't.
        new Intl.DateTimeFormat(i18n.locale, { month: 'short', day: 'numeric' }).format(
          sync.lastSyncedAt,
        );
  const now = new Date();
  const photos = usePlaceTilePhotos(
    search.rows.flatMap((place) => (place.poiId === null ? [] : [place.poiId])),
  );
  const rows: OfflineRow[] = search.rows.map((place) => {
    const parts: string[] = [];
    const minutes = walkMinutes(here, {
      ...(place.lat === null ? {} : { lat: place.lat }),
      ...(place.lng === null ? {} : { lng: place.lng }),
    });
    if (minutes !== null)
      parts.push(t({ id: 'search.offline.walk', message: `${minutes} min walk` }));
    const open = openBySyncedHours(search.hours.get(place.poiId ?? place.id), trip.tz, now);
    if (open === true && syncedOn !== null) {
      parts.push(t({ id: 'search.offline.openAsOf', message: `open, as of ${syncedOn}` }));
    } else if (place.tags[0] !== undefined) parts.push(place.tags[0].replace(/_/gu, ' '));
    return {
      key: place.poiId ?? place.id,
      title: place.name,
      category: place.category,
      meta: parts.length === 0 ? undefined : parts.join(' · '),
      saved: place.source === 'idea',
    };
  });
  return { rows, photos, syncedOn };
}

export interface OfflineRow {
  readonly key: string;
  readonly title: string;
  readonly category: string | null;
  /** "4 min walk · open, as of Oct 11". */
  readonly meta: string | undefined;
  readonly saved: boolean;
}
