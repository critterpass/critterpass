/**
 * The places map (7c-1, 7c-2) on the phone's data: the trip's places, plan and crew from the local
 * database, the fits of the places on the cards from the fit route, the region pack, and where
 * each tap leads.
 */
import { toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useSyncPhase } from '@/data/status/use-sync-status';

import { RegionPackCardView } from '../components/region-pack-card';
import { useOfflinePack } from '../data/use-offline-pack';
import { guideFor } from '../format';
import { useBrowsePhotos } from '../map-queries';
import { withProfileTiles } from '../profile-photo';
import type { PlacesFilter } from './places-model';
import { PlacesMapView } from './places-map-view';
import { addToPlanHref, placeHref, searchHref, useCanAddToPlan } from './places-nav';
import type { ResultsMode } from './routes';
import { usePlaceFits, weekdaysOf } from './use-place-fits';
import { usePlacesData } from './use-places-data';
import { usePendingPlaces } from './use-swipe-actions';

export interface PlacesMapScreenProps {
  /** Outside a trip: the map's own field over the places on this phone. */
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly tripId: string | null;
  /** Outside a trip: the destination's id or slug. */
  readonly destination?: string | null | undefined;
  readonly placeId?: string | null | undefined;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly results: ResultsMode | null;
  readonly onLeaveResults: () => void;
  readonly onList: () => void;
  readonly onBack: () => void;
}

export function PlacesMapScreen(props: PlacesMapScreenProps) {
  const { tripId } = props;
  const data = usePlacesData({
    tripId,
    destination: props.destination,
    results: props.results?.ids ?? null,
    query: props.query,
  });
  const { i18n } = useLingui();
  // Saves made in the list a moment ago count here before they have synced.
  const places = usePendingPlaces(tripId, data.places, data.uid);
  const weekdays = useMemo(() => weekdaysOf(data.days, i18n.locale), [data.days, i18n.locale]);
  const syncPhase = useSyncPhase();
  const pack = useOfflinePack(data.destinationId ?? '', data.destinationSlug ?? '');
  // Add to plan shows its + only once its screen is on this phone.
  const canAdd = useCanAddToPlan(tripId);
  const [asked, setAsked] = useState<readonly string[]>([]);
  const onAsk = useCallback((ids: readonly string[]) => setAsked(ids), []);
  const fitLines = usePlaceFits({
    tripId,
    versionId: data.versionId,
    days: data.days,
    stopName: data.stopName,
    tz: data.tz,
    ask: asked,
    ideas: data.ideas,
  });
  const today = useMemo(() => toLocalWallTime(new Date(), data.tz ?? 'UTC').date, [data.tz]);
  const poiOf = (id: string) => places.find((entry) => entry.id === id)?.poiId ?? id;
  const downloaded = pack.status === 'downloaded' || pack.status === 'checking';
  const assets = usePlaceTilePhotos(asked);
  // A place whose photos live in its AI profile shows the first of them, from the browse.
  const profilePhotos = useBrowsePhotos(data.destinationId);
  const photos = useMemo(() => withProfileTiles(assets, profilePhotos), [assets, profilePhotos]);
  return (
    <PlacesMapView
      inTrip={tripId !== null}
      loaded={data.loaded}
      places={places}
      weekdays={weekdays}
      crew={data.crew}
      routes={data.routes}
      today={today}
      destinationName={data.destinationName}
      destinationSlug={data.destinationSlug}
      guide={guideFor(data.guideSlug)}
      stay={data.stay}
      tz={data.tz}
      canDraw={syncPhase !== 'offline' || pack.uri !== null}
      localRegionUri={pack.uri}
      pack={
        downloaded ? null : (
          <RegionPackCardView
            destinationName={data.destinationName}
            status={pack.status}
            progress={pack.progress}
            bytes={pack.bytes}
            onDownload={pack.download}
            onRemove={pack.remove}
          />
        )
      }
      placeId={props.placeId}
      filter={props.filter}
      onFilter={props.onFilter}
      resultChips={props.results?.chips}
      onLeaveResults={props.onLeaveResults}
      query={props.query}
      onQuery={props.onQuery}
      fitLines={fitLines}
      photos={photos}
      onAsk={onAsk}
      onOpen={(id) => router.push(placeHref(poiOf(id), tripId, data.destinationId))}
      onAdd={
        tripId === null || !canAdd
          ? undefined
          : (id) => {
              const href = addToPlanHref(tripId, poiOf(id));
              if (href !== undefined) router.push(href);
            }
      }
      onSearch={() => {
        const href = searchHref(tripId, tripId === null ? 'explore' : 'map');
        if (href !== undefined) router.push(href);
      }}
      onList={props.onList}
      onBack={props.onBack}
    />
  );
}
