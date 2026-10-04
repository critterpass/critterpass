/**
 * The search body with no signal (7i-2): the phone's places for what was typed, by name and kind,
 * with walking minutes from you (or from where the search was opened) and "open, as of" from the
 * last sync, the queued question, and what works offline.
 */
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { TripPlaceSearch } from '@/data/places/use-trip-place-search';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useTheme } from '@/ui';

import { useMyPosition } from '../hooks/use-my-position';
import { openBySyncedHours, walkMinutes, type LatLng } from './offline-model';
import { OfflineResults, type OfflineRow } from './offline-results';
import type { SearchTrip } from './use-search-trip';
import { WorksOfflineChips } from './works-offline-chips';

export interface OfflineSectionProps {
  readonly search: TripPlaceSearch;
  readonly trip: SearchTrip;
  readonly area: string;
  /** Where the search was opened from, when there is no position. */
  readonly from: LatLng | null;
  readonly queued: number;
  readonly onOpen: (key: string) => void;
}

export function OfflineSection({ search, trip, area, from, queued, onOpen }: OfflineSectionProps) {
  const theme = useTheme();
  const { i18n } = useLingui();
  const position = useMyPosition();
  const sync = useSyncStatus();
  const here = position.kind === 'at' ? position.point : from;
  const syncedOn =
    sync.lastSyncedAt === null
      ? null
      : sync.lastSyncedAt.toLocaleDateString(i18n.locale, { month: 'short', day: 'numeric' });
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
  return (
    <View style={{ gap: theme.space['20'] }}>
      <OfflineResults
        rows={rows}
        photos={photos}
        area={area}
        saved={search.counts.saved}
        curated={search.counts.curated}
        destination={trip.destination}
        syncedOn={syncedOn}
        guide={trip.guide}
        guideName={trip.guideName}
        queued={queued}
        onOpen={onOpen}
      />
      <WorksOfflineChips places={search.counts.curated} guideName={trip.guideName} />
    </View>
  );
}
