/**
 * The places list (7c-3) on the phone's data: the trip's places from the local database, Tokek's
 * ranked suggestions from the suggest route, fit lines for the crew's ideas, the sponsored slot,
 * swipe to save or hide (queued offline, with undo) and where each tap leads.
 */
import type { PlaceFit } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useSponsoredSlot } from '../data/use-sponsored-slot';
import { guideFor } from '../format';
import { useSponsoredEvents } from '../hooks/use-sponsored-events';
import { exploreRoutes } from '../routes';
import type { ListKind } from '../sponsored-model';
import { PLACES_COMMANDS } from './commands';
import { PlacesListView } from './places-list-view';
import { CATEGORY_GROUPS, isCategoryGroup, type PlacesFilter } from './places-model';
import {
  addToPlanHref,
  placeHref,
  planHref,
  searchHref,
  splitHref,
  useCanAddToPlan,
} from './places-nav';
import type { ResultsMode } from './routes';
import { usePlaceFits, weekdaysOf } from './use-place-fits';
import { usePlacesData } from './use-places-data';
import { useSuggestions } from './use-suggestions';
import { useSwipeActions } from './use-swipe-actions';

/** The sponsored slot's list kind for a list of places. */
const SEARCH: ListKind = 'search';

export interface PlacesListScreenProps {
  /** Outside a trip: the map's own field over the places on this phone. */
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly tripId: string | null;
  readonly destination?: string | null | undefined;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly results: ResultsMode | null;
  readonly onLeaveResults: () => void;
  readonly onMap: () => void;
  readonly onBack: () => void;
}

export function PlacesListScreen(props: PlacesListScreenProps) {
  const { i18n } = useLingui();
  const { commands } = useLocalFirst();
  const { tripId, filter } = props;
  const data = usePlacesData({
    tripId,
    destination: props.destination,
    results: props.results?.ids ?? null,
    query: props.query,
  });
  const swipe = useSwipeActions(tripId, data.places, data.uid);
  const canAdd = useCanAddToPlan(tripId);
  const categories = useMemo(
    () => (isCategoryGroup(filter) ? [...CATEGORY_GROUPS[filter]] : []),
    [filter],
  );
  const suggestions = useSuggestions(
    props.results === null ? tripId : null,
    data.versionId,
    categories,
  );
  const fits = useMemo(() => {
    const known = new Map<string, PlaceFit>(suggestions.fits);
    for (const idea of data.ideas) {
      if (idea.poiId !== null && idea.fit !== null && idea.fit.version_id === data.versionId) {
        known.set(idea.poiId, idea.fit);
      }
    }
    return known;
  }, [suggestions.fits, data.ideas, data.versionId]);
  const savedIds = useMemo(
    () => data.ideas.flatMap((idea) => (idea.poiId === null ? [] : [idea.poiId])),
    [data.ideas],
  );
  const lines = usePlaceFits({
    tripId,
    versionId: data.versionId,
    days: data.days,
    stopName: data.stopName,
    tz: data.tz,
    ask: savedIds,
    ideas: data.ideas,
    known: suggestions.fits,
  });
  const weekdays = useMemo(() => weekdaysOf(data.days, i18n.locale), [data.days, i18n.locale]);
  const slot = useSponsoredSlot({ destinationId: data.destinationId, list: SEARCH, tripId });
  const sponsoredEvents = useSponsoredEvents(slot?.placement_id ?? null, SEARCH);
  const go = (href: ReturnType<typeof searchHref>) => {
    if (href !== undefined) router.push(href);
  };

  return (
    <PlacesListView
      inTrip={tripId !== null}
      places={swipe.places}
      crew={data.crew}
      stay={data.stay}
      destinationName={data.destinationName}
      guide={guideFor(data.guideSlug)}
      filter={filter}
      onFilter={props.onFilter}
      resultChips={props.results?.chips}
      onLeaveResults={props.onLeaveResults}
      query={props.query}
      onQuery={props.onQuery}
      fits={fits}
      lines={lines}
      weekdays={weekdays}
      suggestOrder={tripId === null ? null : suggestions.order}
      suggestTotal={tripId === null ? null : suggestions.total}
      onLoadMore={suggestions.loadMore}
      sponsored={
        slot === null
          ? null
          : {
              poiId: slot.poi_id,
              onWhy: () =>
                router.push(exploreRoutes.whySponsored(slot.partner, data.destinationName)),
            }
      }
      hidden={data.hidden}
      onUnhide={(poiId) => void commands.send(PLACES_COMMANDS.unhide_place, { poi_id: poiId })}
      onAction={tripId === null ? undefined : swipe.act}
      onOpen={(place, sponsored) => {
        if (sponsored) sponsoredEvents.click();
        router.push(placeHref(place.poiId ?? place.id, tripId, data.destinationId));
      }}
      onAdd={tripId === null || !canAdd ? undefined : (poiId) => go(addToPlanHref(tripId, poiId))}
      onSplit={tripId === null ? undefined : (poiId) => go(splitHref(tripId, poiId))}
      onPlan={tripId === null ? undefined : () => go(planHref(tripId))}
      onSearch={() => go(searchHref(tripId, tripId === null ? 'explore' : 'map'))}
      onMap={props.onMap}
      onBack={props.onBack}
    />
  );
}
