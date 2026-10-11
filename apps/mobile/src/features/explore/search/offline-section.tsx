/**
 * The search body with no signal (7i-2): the phone's places for what was typed, by name and kind,
 * with walking minutes from you (or from where the search was opened) and "open, as of" from the
 * last sync, the queued question, and what works offline.
 */
import { View } from 'react-native';

import type { TripPlaceSearch } from '@/data/places/use-trip-place-search';
import { useTheme } from '@/ui';

import type { LatLng } from './offline-model';
import { OfflineResults } from './offline-results';
import { useOfflineRows } from './use-offline-rows';
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
  const { rows, photos, syncedOn } = useOfflineRows(search, trip, from);
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
