/**
 * The places list (7c-3): the map's places as rows grouped by where they stand (saved but not in a
 * day, in the plan, Tokek's suggestions), each saying when it would fit, in the chosen order. Swipe
 * right saves, left hides (each with undo); MAP goes back with the same filter. Outside a trip the
 * same list has no plan group and no fit.
 */
import type { PlaceFit } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import type { StackMember } from '@/ui/people/AvatarStack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import { useSponsoredSlot } from '../data/use-sponsored-slot';
import { guideFor } from '../format';
import { useSponsoredEvents } from '../hooks/use-sponsored-events';
import { centreOf } from '../map-model';
import { exploreRoutes } from '../routes';
import type { ListKind } from '../sponsored-model';
import { PLACES_COMMANDS } from './commands';
import { minutesBetween } from './label-sync';
import { listItems, type ListItem } from './list-items';
import { placeGroups, type SortMode } from './place-groups';
import {
  bestTimeLine,
  planGroupTitle,
  rowMeta,
  savedGroupTitle,
  suggestsGroupTitle,
} from './places-copy';
import { PlacesHeader } from './places-header';
import { GroupTitle, PlaceListRow, PlanSummaryRow, RowGap } from './places-list-rows';
import {
  CATEGORY_GROUPS,
  isCategoryGroup,
  placeCounts,
  type HubPlace,
  type PlacesFilter,
} from './places-model';
import {
  addToPlanHref,
  placeHref,
  planHref,
  searchHref,
  splitHref,
  useCanAddToPlan,
} from './places-nav';
import type { ResultsMode } from './routes';
import { SortMenu } from './sort-menu';
import { usePlaceFits, weekdaysOf } from './use-place-fits';
import { usePlacesData } from './use-places-data';
import { useSuggestions } from './use-suggestions';
import { useSwipeActions } from './use-swipe-actions';

/** The sponsored slot's list kind for a list of places. */
const SEARCH: ListKind = 'search';

export interface PlacesListScreenProps {
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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { i18n } = useLingui();
  const { commands } = useLocalFirst();
  const { tripId, filter } = props;
  const data = usePlacesData({
    tripId,
    destination: props.destination,
    results: props.results?.ids ?? null,
  });
  const guide = guideFor(data.guideSlug);
  const swipe = useSwipeActions(tripId, data.places, data.plan.uid);
  const canAdd = useCanAddToPlan(tripId);
  const [sort, setSort] = useState<SortMode>(tripId === null ? 'nearest' : 'fit');
  const categories = useMemo(
    () => (isCategoryGroup(filter) ? [...CATEGORY_GROUPS[filter]] : []),
    [filter],
  );
  const suggestions = useSuggestions(
    props.results === null ? tripId : null,
    data.plan.versionId,
    categories,
  );

  const fits = useMemo(() => {
    const known = new Map<string, PlaceFit>(suggestions.fits);
    for (const idea of data.ideas) {
      if (idea.poiId !== null && idea.fit !== null && idea.fit.version_id === data.plan.versionId) {
        known.set(idea.poiId, idea.fit);
      }
    }
    return known;
  }, [suggestions.fits, data.ideas, data.plan.versionId]);
  const from = data.stay?.at ?? centreOf(swipe.places);
  const groups = useMemo(
    () =>
      placeGroups({
        places: swipe.places,
        filter,
        sort,
        fits,
        suggestOrder: tripId === null || suggestions.total === null ? null : suggestions.order,
        from,
      }),
    [swipe.places, filter, sort, fits, tripId, suggestions.total, suggestions.order, from],
  );
  const savedIds = useMemo(
    () => groups.saved.flatMap((place) => (place.poiId === null ? [] : [place.poiId])),
    [groups.saved],
  );
  const lines = usePlaceFits({
    tripId,
    plan: data.plan,
    tz: data.tz,
    ask: savedIds,
    ideas: data.ideas,
    known: suggestions.fits,
  });
  const weekdays = useMemo(
    () => weekdaysOf(data.plan.dayRows, i18n.locale),
    [data.plan.dayRows, i18n.locale],
  );
  const slot = useSponsoredSlot({ destinationId: data.destinationId, list: SEARCH, tripId });
  const sponsoredEvents = useSponsoredEvents(slot?.placement_id ?? null, SEARCH);
  const items = useMemo(() => listItems(groups, slot?.poi_id ?? null), [groups, slot?.poi_id]);
  const counts = useMemo(() => placeCounts(swipe.places), [swipe.places]);

  const crew = data.plan.crew;
  const saversOf = useCallback(
    (place: HubPlace): StackMember[] =>
      place.backerIds.map((uid) => {
        const index = crew.findIndex((member) => member.user_id === uid);
        return { key: uid, name: crew[index]?.display_name ?? '', joinIndex: Math.max(0, index) };
      }),
    [crew],
  );
  const lineFor = (place: HubPlace) => {
    const fit = place.poiId === null ? undefined : fits.get(place.poiId);
    if (place.standing === 'suggested' && place.bestTime !== null && fit?.best) {
      return {
        text: bestTimeLine(place.bestTime, weekdays.get(fit.best.day_no) ?? null),
        tone: 'fits' as const,
      };
    }
    return place.poiId === null ? undefined : lines.get(place.poiId);
  };
  const go = (href: ReturnType<typeof searchHref>) => {
    if (href !== undefined) router.push(href);
  };

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'title') {
      const title =
        item.group === 'saved'
          ? savedGroupTitle(groups.saved.length)
          : item.group === 'plan'
            ? planGroupTitle(groups.plan.length)
            : suggestsGroupTitle(guide.name, suggestions.total ?? groups.suggests.length);
      return <GroupTitle title={title} testID={`places-group-${item.group}`} />;
    }
    if (item.kind === 'plan') {
      const href = tripId === null ? undefined : planHref(tripId);
      return (
        <PlanSummaryRow
          places={groups.plan}
          onPress={href === undefined ? undefined : () => go(href)}
        />
      );
    }
    const { place } = item;
    const poiId = place.poiId;
    return (
      <>
        <PlaceListRow
          place={place}
          meta={rowMeta(
            place.category,
            data.stay === null ? null : minutesBetween(data.stay.at, place),
          )}
          savers={saversOf(place)}
          fit={lineFor(place)}
          onOpen={() => {
            if (item.sponsored) sponsoredEvents.click();
            router.push(placeHref(poiId ?? place.id, tripId, data.destinationId));
          }}
          onAdd={
            tripId === null || !canAdd || poiId === null
              ? undefined
              : () => go(addToPlanHref(tripId, poiId))
          }
          onSplit={
            tripId === null || poiId === null ? undefined : () => go(splitHref(tripId, poiId))
          }
          onAction={
            tripId === null || poiId === null ? undefined : (action) => swipe.act(place, action)
          }
          sponsored={
            item.sponsored && slot !== null
              ? {
                  onWhy: () =>
                    router.push(exploreRoutes.whySponsored(slot.partner, data.destinationName)),
                }
              : undefined
          }
          testID={`places-row-${String(index)}`}
        />
        <RowGap />
      </>
    );
  };

  return (
    <Scaffold variant="dark" edges={[]} testID="places-list">
      <View style={{ paddingTop: insets.top + theme.space['8'] }}>
        <PlacesHeader
          destinationName={data.destinationName}
          guide={guide}
          mode="list"
          onBack={props.onBack}
          onSearch={() => go(searchHref(tripId, tripId === null ? 'explore' : 'map'))}
          onToggleMode={props.onMap}
          counts={counts}
          filter={filter}
          onFilter={props.onFilter}
          inTrip={tripId !== null}
          resultChips={props.results?.chips}
          onLeaveResults={props.onLeaveResults}
        />
        <SortMenu
          sort={sort}
          onSort={setSort}
          count={counts.all}
          inTrip={tripId !== null}
          hidden={data.hidden}
          onUnhide={(poiId) => void commands.send(PLACES_COMMANDS.unhide_place, { poi_id: poiId })}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onEndReached={suggestions.loadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}
        testID="places-list-rows"
      />
    </Scaffold>
  );
}
