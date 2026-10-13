/**
 * The places map (7c-1, 7c-2) on the phone's data: the trip's places, plan and crew from the local
 * database, the fits of the places on the cards from the fit route, the region pack, and where
 * each tap leads.
 */
import { toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentType } from 'react';

import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useSyncPhase } from '@/data/status/use-sync-status';

import { RegionPackCardView } from '../premium/components/region-pack-card';
import { useOfflinePack } from '../data/use-offline-pack';
import { guideFor } from '../format';
import { useBrowsePhotos } from '../map-queries';
import { withProfileTiles } from '../profile-photo';
import type { PlacesFilter } from './places-model';
import { forgetPlaces } from './places-resume';
import { addToPlanHref, placeHref, searchHref, useCanAddToPlan } from './places-nav';
import type { ResultsMode } from './routes';
import { usePlaceFits, weekdaysOf } from './use-place-fits';
import { usePlacesData } from './use-places-data';
import { usePendingPlaces } from './use-swipe-actions';
import { type ReactNode } from 'react';
import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { FitLine } from '@/data/fit/fit-line';
import type { GuideFacts } from '../format';
import { type Point } from '../map-model';
import { type PlanRouteDay } from './plan-routes';
import { type HubPlace } from './places-model';
import type { CrewMember } from './use-places-data';

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
  /** The drawing of the map. */
  readonly View: ComponentType<PlacesMapViewProps>;
}

export function PlacesMapScreen(props: PlacesMapScreenProps) {
  const { tripId, View } = props;
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
  const resumeKey = tripId ?? props.destination ?? undefined;
  return (
    <View
      inTrip={tripId !== null}
      loaded={data.loaded}
      failed={data.failed}
      onRetry={data.retry}
      centre={data.centre}
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
        // A download cannot start with no signal: the card waits for one.
        downloaded || syncPhase === 'offline' ? null : (
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
      onBack={() => {
        // Leaving the places for good: the next visit starts afresh.
        forgetPlaces(resumeKey);
        props.onBack();
      }}
      resumeKey={resumeKey}
    />
  );
}

export interface PlacesMapViewProps {
  readonly inTrip: boolean;
  readonly loaded: boolean;
  /** The places did not load and the phone holds none. */
  readonly failed?: boolean | undefined;
  readonly onRetry?: (() => void) | undefined;
  /** The middle of the destination's places whatever is typed: the map stays when none match. */
  readonly centre?: Point | null | undefined;
  readonly places: readonly HubPlace[];
  readonly crew: readonly CrewMember[];
  readonly routes: readonly PlanRouteDay[];
  /** Today's local date in the trip's zone: the map leads with today's route. */
  readonly today: string;
  readonly destinationName: string;
  readonly destinationSlug: string | null;
  readonly guide: GuideFacts;
  readonly stay: { readonly name: string; readonly at: Point } | null;
  readonly tz: string | null;
  /** Each plan day's short weekday, for "In the plan · Tue" on a planned place's card. */
  readonly weekdays?: ReadonlyMap<number, string> | undefined;
  /** Whether the map can draw (online, or the region is on this phone). */
  readonly canDraw: boolean;
  readonly localRegionUri: string | null;
  /** The region pack card while the region isn't on this phone; null once it is. */
  readonly pack: ReactNode | null;
  readonly placeId?: string | null | undefined;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly resultChips?: readonly string[] | undefined;
  readonly onLeaveResults: () => void;
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly fitLines: ReadonlyMap<string, FitLine>;
  readonly photos?: PlaceTilePhotos | undefined;
  /** The places on the cards, for the screen to ask their fits. */
  readonly onAsk: (poiIds: readonly string[]) => void;
  readonly onOpen: (id: string) => void;
  readonly onAdd?: ((id: string) => void) | undefined;
  readonly onSearch: () => void;
  readonly onList: () => void;
  readonly onBack: () => void;
  /** Names the trip or destination whose camera and pick the map shares with the list. */
  readonly resumeKey?: string | undefined;
}
