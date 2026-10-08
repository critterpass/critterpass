/**
 * The places list (7c-3), drawn from plain values: the places as rows grouped by where they stand
 * (saved but not in a day, in the plan, Tokek's suggestions), each saying when it would fit, in the
 * chosen order, with the sort menu, at most one labelled sponsored row and the way back to the map.
 */
import type { PlaceFit } from '@cp/domain';
import { FlashList } from '@shopify/flash-list';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FitLine } from '@/data/fit/fit-line';
import { screenCredits, type PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { PhotoCredit } from '@/ui/planning/photo-credit';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { centreOf, type Point } from '../map-model';
import { listItems, planDays, type ListItem } from './list-items';
import type { PlaceFacts } from './place-facts';
import { listOrder, placeGroups, type SortMode } from './place-groups';
import { sortLabel, swipeHint } from './places-copy';
import { PlacesEmpty, PlacesFailed } from './places-empty';
import { PlacesHeader } from './places-header';
import { PlacesListItem, type ListRowFacts } from './places-list-item';
import { passesFilter, placeCounts, type HubPlace, type PlacesFilter } from './places-model';
import type { PlanRouteDay } from './plan-routes';
import { SortMenu, type HiddenEntry } from './sort-menu';
import type { SwipeAction } from './swipe-actions';
import type { CrewMember } from './use-places-data';

/** Where the list stands before it has rows: still reading, or the read failed with none. */
export type PlacesListStatus = 'loading' | 'failed' | 'ready';

interface RowExtra {
  readonly list: ListRowFacts;
  readonly photos: PlaceTilePhotos | undefined;
}

const keyOf = (item: ListItem) => item.key;
const typeOf = (item: ListItem) => item.kind;
const renderRow = ({ item, extraData }: { item: ListItem; extraData?: RowExtra }) =>
  extraData === undefined ? null : (
    <PlacesListItem
      item={item}
      list={extraData.list}
      photo={
        item.kind === 'place' && item.place.poiId !== null
          ? extraData.photos?.get(item.place.poiId)
          : undefined
      }
    />
  );

export interface PlacesListViewProps {
  readonly inTrip: boolean;
  /** Absent reads as ready. */
  readonly status?: PlacesListStatus | undefined;
  readonly onRetry?: (() => void) | undefined;
  /** Where the traveller is, when they are in the destination: "nearest" measures from there. */
  readonly viewer?: Point | null | undefined;
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
  const status = props.status ?? 'ready';
  // Must-sees and the guide's picks lead until the traveller asks for another order.
  const [sort, setSort] = useState<SortMode>('fit');
  const viewer = props.stay === null ? (props.viewer ?? null) : null;
  const middle = useMemo(() => centreOf(places), [places]);
  const from = props.stay?.at ?? viewer ?? middle;
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
    fromViewer: viewer !== null,
  };
  const sortLabels: Record<SortMode, string> = {
    fit: sortLabel(listOrder({ sort: 'fit', suggestOrder, fits, ranks, from }), orderFacts),
    nearest: sortLabel(from === null ? 'az' : 'nearest', orderFacts),
    az: sortLabel('az', orderFacts),
  };
  const crewByUid = useMemo(() => new Map(crew.map((member) => [member.uid, member])), [crew]);
  // The rows' handlers keep one identity for the list's life and read the latest props.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const canAdd = props.onAdd !== undefined;
  const canSplit = props.onSplit !== undefined;
  const canAct = props.onAction !== undefined;
  const hasSponsor = props.sponsored !== null;
  const stayAt = props.stay?.at ?? null;
  const guideName = props.guide.name;
  const list = useMemo(
    (): ListRowFacts => ({
      guideName,
      savedCount: groups.saved.length,
      suggestCount,
      planned: groups.plan,
      order,
      from,
      stayAt,
      facts,
      fits,
      lines,
      weekdays,
      crew: crewByUid,
      onOpen: (place, sponsored) => latest.current.onOpen(place, sponsored),
      onAdd: canAdd ? (poiId) => latest.current.onAdd?.(poiId) : undefined,
      onSplit: canSplit ? (poiId) => latest.current.onSplit?.(poiId) : undefined,
      onAction: canAct
        ? (place: HubPlace, action: SwipeAction) => latest.current.onAction?.(place, action)
        : undefined,
      onWhy: hasSponsor ? () => latest.current.sponsored?.onWhy() : undefined,
      onPlan: () => latest.current.onFilter('plan'),
    }),
    [
      guideName,
      groups,
      suggestCount,
      order,
      from,
      stayAt,
      facts,
      fits,
      lines,
      weekdays,
      crewByUid,
      canAdd,
      canSplit,
      canAct,
      hasSponsor,
    ],
  );
  const { photos } = props;
  const extra = useMemo((): RowExtra => ({ list, photos }), [list, photos]);

  // The list wants one handler for its whole life; it reads the latest prop through the ref.
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
      <FlashList
        data={items}
        extraData={extra}
        keyExtractor={keyOf}
        getItemType={typeOf}
        // A row saved by a swipe moves to the group at the top: the list stays where it is scrolled
        // (at the top, on the new group), as it did before, instead of following the rows under it.
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderRow}
        onEndReached={props.onLoadMore}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewable}
        ListEmptyComponent={
          status === 'loading' ? (
            <View style={{ padding: theme.size.gutter }} testID="places-list-loading">
              <Skeleton preset="list" repeat={4} />
            </View>
          ) : status === 'failed' ? (
            <PlacesFailed guide={props.guide} onRetry={props.onRetry} />
          ) : (
            <PlacesEmpty
              kind={filter === 'saved' || filter === 'plan' ? filter : 'none'}
              guide={props.guide}
              onShowAll={
                filter === 'all' && (props.query ?? '') === ''
                  ? undefined
                  : () => {
                      props.onFilter('all');
                      props.onQuery?.('');
                    }
              }
            />
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}
        testID="places-list-rows"
      />
    </Scaffold>
  );
}
