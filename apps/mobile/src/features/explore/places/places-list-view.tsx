/**
 * The places list (7c-3), drawn from plain values: the places as rows grouped by where they stand
 * (saved but not in a day, in the plan, Tokek's suggestions), each saying when it would fit, in the
 * chosen order, with the sort menu, at most one labelled sponsored row and the way back to the map.
 */
import type { PlaceFit } from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FitLine } from '@/data/fit/fit-line';
import { screenCredits, type PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { StackMember } from '@/ui/people/AvatarStack';
import { PhotoCredit } from '@/ui/planning/photo-credit';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { centreOf, distanceMeters, type Point } from '../map-model';
import { minutesBetween } from './label-sync';
import { listItems, planDays, type ListItem } from './list-items';
import type { PlaceFacts } from './place-facts';
import { listOrder, placeGroups, type SortMode } from './place-groups';
import {
  bestTimeLine,
  inPlanLine,
  planDayTitle,
  planGroupTitle,
  rowMeta,
  savedGroupTitle,
  sortLabel,
  suggestsGroupTitle,
  swipeHint,
} from './places-copy';
import { PlacesEmpty } from './places-empty';
import { PlacesHeader } from './places-header';
import { GroupTitle, PlaceListRow, PlanSummaryRow, RowGap } from './places-list-rows';
import { passesFilter, placeCounts, type HubPlace, type PlacesFilter } from './places-model';
import type { PlanRouteDay } from './plan-routes';
import { SortMenu, type HiddenEntry } from './sort-menu';
import type { SwipeAction } from './swipe-actions';
import type { CrewMember } from './use-places-data';

export interface PlacesListViewProps {
  readonly inTrip: boolean;
  readonly places: readonly HubPlace[];
  readonly crew: readonly CrewMember[];
  /** The plan's days as routes: the IN THE PLAN filter lists their stops in order. */
  readonly routes?: readonly PlanRouteDay[] | undefined;
  /** Each place's standing in the recommended order and its area, by place id. */
  readonly facts?: ReadonlyMap<string, PlaceFacts> | undefined;
  /** Whether the swipe hint still helps (nothing was saved by a swipe yet). */
  readonly showSwipeHint?: boolean | undefined;
  readonly stay: { readonly name: string; readonly at: Point } | null;
  readonly destinationName: string;
  readonly guide: GuideFacts;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly resultChips?: readonly string[] | undefined;
  readonly onLeaveResults: () => void;
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  /** Fits by place id, for the order. */
  readonly fits: ReadonlyMap<string, PlaceFit>;
  /** Fit lines by place id, for the rows. */
  readonly lines: ReadonlyMap<string, FitLine>;
  /** Each day's short weekday, for the editors' best-time lines. */
  readonly weekdays: ReadonlyMap<number, string>;
  /** The places' photos by POI id, and the rows on screen, for the screen to read theirs. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly onInView?: ((poiIds: readonly string[]) => void) | undefined;
  /** The server's ranked suggestions and their count; null before it answers. */
  readonly suggestOrder: readonly string[] | null;
  readonly suggestTotal: number | null;
  readonly onLoadMore?: (() => void) | undefined;
  readonly sponsored: { readonly poiId: string; readonly onWhy: () => void } | null;
  readonly hidden: readonly HiddenEntry[];
  readonly onUnhide: (poiId: string) => void;
  readonly onAction?: ((place: HubPlace, action: SwipeAction) => void) | undefined;
  readonly onOpen: (place: HubPlace, sponsored: boolean) => void;
  readonly onAdd?: ((poiId: string) => void) | undefined;
  readonly onSplit?: ((poiId: string) => void) | undefined;
  readonly onSearch: () => void;
  readonly onMap: () => void;
  readonly onBack: () => void;
}

export function PlacesListView(props: PlacesListViewProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { places, filter, fits, lines, weekdays, crew } = props;
  const [sort, setSort] = useState<SortMode>(props.inTrip ? 'fit' : 'nearest');
  const from = props.stay?.at ?? centreOf(places);
  const { facts, routes } = props;
  const ranks = useMemo(
    () =>
      new Map(
        [...(facts ?? [])].flatMap(([id, fact]) =>
          fact.rank === null ? [] : [[id, fact.rank] as const],
        ),
      ),
    [facts],
  );
  const suggestOrder = props.suggestTotal === null ? null : props.suggestOrder;
  const groups = useMemo(
    () => placeGroups({ places, filter, sort, fits, suggestOrder, from, ranks }),
    [places, filter, sort, fits, suggestOrder, from, ranks],
  );
  const order = listOrder({ sort, suggestOrder, fits, ranks, from });
  // The server's count answers its own ranking; in any other order the phone's rows are counted.
  const suggestCount =
    order === 'fit' ? (props.suggestTotal ?? groups.suggests.length) : groups.suggests.length;
  const items = useMemo(
    () =>
      listItems(
        groups,
        props.sponsored?.poiId ?? null,
        filter === 'plan' ? planDays(routes ?? [], groups.plan) : undefined,
      ),
    [groups, props.sponsored?.poiId, filter, routes],
  );
  const counts = useMemo(() => placeCounts(places), [places]);
  const shown = useMemo(
    () => places.filter((place) => passesFilter(place, filter)).length,
    [places, filter],
  );
  const orderFacts = {
    guide: props.guide.name,
    stay: props.stay?.name ?? null,
    destination: props.destinationName,
  };
  const sortLabels: Record<SortMode, string> = {
    fit: sortLabel(listOrder({ sort: 'fit', suggestOrder, fits, ranks, from }), orderFacts),
    nearest: sortLabel(from === null ? 'az' : 'nearest', orderFacts),
    az: sortLabel('az', orderFacts),
  };
  const byUid = useMemo(() => new Map(crew.map((member) => [member.uid, member])), [crew]);
  const saversOf = useCallback(
    (place: HubPlace): StackMember[] =>
      place.backerIds.map((uid) => ({
        key: uid,
        name: byUid.get(uid)?.name ?? '',
        joinIndex: byUid.get(uid)?.joinIndex ?? 0,
      })),
    [byUid],
  );
  const lineFor = (place: HubPlace): FitLine | undefined => {
    const fit = place.poiId === null ? undefined : fits.get(place.poiId);
    if (place.standing === 'suggested' && place.bestTime !== null && fit?.best) {
      return {
        text: bestTimeLine(place.bestTime, weekdays.get(fit.best.day_no) ?? null),
        tone: 'fits',
      };
    }
    return place.poiId === null ? undefined : lines.get(place.poiId);
  };

  // FlatList wants one handler for its whole life; it reads the latest prop through the ref.
  const inView = useRef(props.onInView);
  useEffect(() => {
    inView.current = props.onInView;
  });
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: readonly { readonly item: ListItem }[] }) => {
        inView.current?.(
          viewableItems.flatMap(({ item }) =>
            item.kind === 'place' && item.place.poiId !== null ? [item.place.poiId] : [],
          ),
        );
      },
  );

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'title') {
      const title =
        item.group === 'saved'
          ? savedGroupTitle(groups.saved.length)
          : item.group === 'plan'
            ? planGroupTitle(groups.plan.length)
            : suggestsGroupTitle(props.guide.name, suggestCount);
      return <GroupTitle title={title} testID={`places-group-${item.group}`} />;
    }
    if (item.kind === 'day') {
      return (
        <GroupTitle
          title={planDayTitle(item.dayNo, item.date, weekdays.get(item.dayNo) ?? null, item.count)}
          testID={`places-plan-day-${String(item.dayNo)}`}
        />
      );
    }
    if (item.kind === 'plan') {
      // The summary opens the plan's own filter: the stops by day, here in the list.
      return <PlanSummaryRow places={groups.plan} onPress={() => props.onFilter('plan')} />;
    }
    const { place } = item;
    const poiId = place.poiId;
    const fact = facts?.get(poiId ?? place.id);
    const { onAdd, onSplit, onAction, sponsored } = props;
    return (
      <>
        <PlaceListRow
          place={place}
          meta={rowMeta(
            place.category,
            props.stay === null ? null : minutesBetween(props.stay.at, place),
            fact?.area ?? null,
            order === 'nearest' && from !== null ? distanceMeters(from, place) : null,
          )}
          planned={
            place.standing === 'plan'
              ? inPlanLine(
                  place.dayNo,
                  place.dayNo === null ? null : (weekdays.get(place.dayNo) ?? null),
                )
              : undefined
          }
          photo={poiId === null ? undefined : props.photos?.get(poiId)}
          savers={saversOf(place)}
          fit={lineFor(place)}
          onOpen={
            poiId === null && place.standing === 'plan'
              ? undefined
              : () => props.onOpen(place, item.sponsored)
          }
          onAdd={onAdd === undefined || poiId === null ? undefined : () => onAdd(poiId)}
          onSplit={onSplit === undefined || poiId === null ? undefined : () => onSplit(poiId)}
          onAction={
            onAction === undefined || poiId === null
              ? undefined
              : (action) => onAction(place, action)
          }
          sponsored={item.sponsored && sponsored !== null ? { onWhy: sponsored.onWhy } : undefined}
          testID={item.testID}
        />
        <RowGap />
      </>
    );
  };

  const credits = screenCredits(props.photos?.values() ?? []);
  return (
    <Scaffold variant="dark" edges={[]} testID="places-list">
      <View style={{ paddingTop: insets.top + theme.space['8'] }}>
        <PlacesHeader
          destinationName={props.destinationName}
          guide={props.guide}
          mode="list"
          onBack={props.onBack}
          onSearch={props.onSearch}
          onToggleMode={props.onMap}
          counts={counts}
          filter={filter}
          onFilter={props.onFilter}
          inTrip={props.inTrip}
          resultChips={props.resultChips}
          onLeaveResults={props.onLeaveResults}
          query={props.query}
          onQuery={props.onQuery}
        />
        <SortMenu
          sort={sort}
          onSort={setSort}
          labels={sortLabels}
          hint={
            props.showSwipeHint === true && props.onAction !== undefined && items.length > 0
              ? swipeHint()
              : undefined
          }
          count={shown}
          inTrip={props.inTrip}
          hidden={props.hidden}
          onUnhide={props.onUnhide}
        />
      </View>
      {credits.length === 0 ? null : (
        // Above the rows, so it is on screen with every photo however far the list scrolls.
        <View style={{ paddingHorizontal: theme.size.gutter, paddingBottom: theme.space['6'] }}>
          <PhotoCredit credits={credits} />
        </View>
      )}
      {items.length === 0 && (filter === 'saved' || filter === 'plan') ? (
        <PlacesEmpty kind={filter} guide={props.guide} onShowAll={() => props.onFilter('all')} />
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onEndReached={props.onLoadMore}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewable}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}
        testID="places-list-rows"
      />
    </Scaffold>
  );
}
