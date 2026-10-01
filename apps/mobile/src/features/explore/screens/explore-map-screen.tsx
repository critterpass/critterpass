/**
 * The Explore map for a destination (inside a trip when one is given): its curated places from the
 * device, filtered by the chips and the search (both work offline), with the cards and the camera
 * kept in step, the viewer's own position when location is already allowed, and the region's
 * offline pack.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { usePermission } from '@/lib/permissions';
import { useFlyTo } from '@/ui/map/useFlyTo';

import { ExploreMapCanvas } from '../components/explore-map-canvas';
import { ExploreMapView } from '../components/explore-map-view';
import type { CarouselCard } from '../components/place-carousel';
import { RegionPackCardView } from '../components/region-pack-card';
import { useExploreStream } from '../data/use-explore-stream';
import { useOfflinePack } from '../data/use-offline-pack';
import { useSponsoredSlot } from '../data/use-sponsored-slot';
import { guideFor } from '../format';
import { useMyPosition } from '../hooks/use-my-position';
import { useSponsoredEvents } from '../hooks/use-sponsored-events';
import { awayLine, cardMeta, planChip } from '../map-copy';
import {
  centreOf,
  filterCounts,
  filterPlaces,
  presence,
  type FilterContext,
  type MapFilter,
} from '../map-model';
import { useCrewPicks, useDestinationPois, usePlannedPlaces } from '../map-queries';
import { openState } from '../place-model';
import { useTripCrew, useTripFacts } from '../place-queries';
import { useDestinationRow } from '../queries';
import { exploreRoutes } from '../routes';
import { useSaved } from '../saved-queries';

export interface ExploreMapScreenProps {
  /** Destination id or slug. */
  readonly destination: string;
  readonly tripId?: string | undefined;
  /** The place to open on. */
  readonly placeId?: string | undefined;
}

export function ExploreMapScreen({ destination, tripId, placeId }: ExploreMapScreenProps) {
  const { i18n } = useLingui();
  const trip = tripId ?? null;
  const { row } = useDestinationRow(destination);
  const id = row?.id ?? null;
  useExploreStream(id);
  const { places, loaded } = useDestinationPois(id);
  const saved = useSaved();
  const crewPicks = useCrewPicks(trip);
  const planned = usePlannedPlaces(trip);
  const crew = useTripCrew(trip);
  const tripFacts = useTripFacts(trip, null);
  const sync = useSyncStatus();
  const position = useMyPosition();
  const location = usePermission('location');
  const pack = useOfflinePack(id ?? '', row?.slug ?? '');
  const flyTo = useFlyTo();
  const guide = guideFor(row?.guide_slug);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<MapFilter>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(placeId ?? null);

  const now = useMemo(() => new Date(), []);
  const tz = tripFacts.tz ?? row?.tz ?? null;
  const context = useMemo(
    (): FilterContext => ({
      savedIds: new Set(saved.rows.map((entry) => entry.refId)),
      crewIds: new Set(crewPicks.keys()),
      tz,
      now,
    }),
    [saved.rows, crewPicks, tz, now],
  );
  const shown = useMemo(
    () => filterPlaces(places, filters, query, context),
    [places, filters, query, context],
  );
  const slot = useSponsoredSlot({ destinationId: id, list: 'map_carousel', tripId: trip });
  const sponsoredEvents = useSponsoredEvents(slot?.placement_id ?? null, 'map_carousel');

  const cards = useMemo((): CarouselCard[] => {
    const name = row?.name ?? '';
    const base = shown.map((poi): CarouselCard => {
      const plan = planned.get(poi.id);
      const keen = crewPicks.get(poi.id) ?? [];
      return {
        id: poi.id,
        name: poi.name,
        category: poi.category,
        meta: cardMeta(poi.category, openState(poi.hours, tz, now)),
        keen: crew
          .filter((member) => keen.includes(member.uid))
          .map((member) => ({ key: member.uid, name: member.name, joinIndex: member.joinIndex })),
        planChip: plan === undefined ? null : planChip(plan.dayNo, plan.startsAt, tz),
      };
    });
    // The sponsored place joins third, labelled, when it is one of the places on show.
    const paid = slot === null ? undefined : base.find((card) => card.id === slot.poi_id);
    if (slot === null || paid === undefined || base.length < 2) return base;
    const rest = base.filter((card) => card !== paid);
    const at = Math.min(2, rest.length);
    return [
      ...rest.slice(0, at),
      {
        ...paid,
        sponsored: { onWhy: () => router.push(exploreRoutes.whySponsored(slot.partner, name)) },
      },
      ...rest.slice(at),
    ];
    // `i18n.locale` re-words the cards when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, planned, crewPicks, crew, tz, now, slot, row?.name, i18n.locale]);

  const selected = shown.find((poi) => poi.id === selectedId) ?? null;
  const { flyToPlace } = flyTo;
  useEffect(() => {
    if (selected !== null) flyToPlace([selected.lng, selected.lat]);
  }, [flyToPlace, selected]);

  const where = presence(position.kind === 'at' ? position.point : null, places);
  const offline = sync.phase === 'offline';
  const canDraw = !offline || pack.uri !== null;
  const open = (card: CarouselCard) => {
    if (card.sponsored !== undefined) sponsoredEvents.click();
    router.push(exploreRoutes.place(card.id, { destinationId: id ?? undefined, tripId }));
  };

  return (
    <ExploreMapView
      destinationName={row?.name ?? ''}
      mode={mode}
      onToggleMode={() => setMode((current) => (current === 'map' ? 'list' : 'map'))}
      query={query}
      onQuery={setQuery}
      filters={filters}
      counts={filterCounts(places, context)}
      inTrip={trip !== null}
      onToggleFilter={(filter) =>
        setFilters((current) => {
          const next = new Set(current);
          if (!next.delete(filter)) next.add(filter);
          return next;
        })
      }
      cards={cards}
      selectedId={selectedId}
      onSettle={setSelectedId}
      onOpen={open}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      canvas={
        canDraw ? (
          <ExploreMapCanvas
            places={shown.map((poi) => ({
              id: poi.id,
              name: poi.name,
              category: poi.category,
              lat: poi.lat,
              lng: poi.lng,
              faces: cards.find((card) => card.id === poi.id)?.keen ?? [],
            }))}
            selectedId={selectedId}
            onSelect={setSelectedId}
            centre={selected ?? centreOf(places)}
            destinationSlug={row?.slug ?? null}
            localRegionUri={pack.uri}
            you={where.kind === 'here' ? where.at : null}
            guide={guide}
            flyTo={flyTo}
          />
        ) : null
      }
      pack={
        <RegionPackCardView
          destinationName={row?.name ?? ''}
          status={pack.status === 'checking' ? 'none' : pack.status}
          progress={pack.progress}
          bytes={pack.bytes}
          onDownload={pack.download}
          onRemove={pack.remove}
        />
      }
      away={where.kind === 'away' ? awayLine(i18n.locale, where.meters, row?.name ?? '') : null}
      locationOff={position.kind === 'denied'}
      onLocationSettings={() => void location.openSettings()}
      loading={!loaded && places.length === 0}
    />
  );
}
