/**
 * The places list (7c-3), drawn from plain values: the places as rows grouped by where they stand
 * (saved but not in a day, in the plan, Tokek's suggestions), each saying when it would fit, in the
 * chosen order, with the sort menu, at most one labelled sponsored row and the way back to the map.
 */
import type { PlaceFit } from '@cp/domain';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FitLine } from '@/data/fit/fit-line';
import type { StackMember } from '@/ui/people/AvatarStack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { centreOf, type Point } from '../map-model';
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
import { placeCounts, type HubPlace, type PlacesFilter } from './places-model';
import { SortMenu, type HiddenEntry } from './sort-menu';
import type { SwipeAction } from './swipe-actions';
import type { CrewMember } from './use-places-data';

export interface PlacesListViewProps {
  readonly inTrip: boolean;
  readonly places: readonly HubPlace[];
  readonly crew: readonly CrewMember[];
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
  readonly onPlan?: (() => void) | undefined;
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
  const groups = useMemo(
    () =>
      placeGroups({
        places,
        filter,
        sort,
        fits,
        suggestOrder: props.suggestTotal === null ? null : props.suggestOrder,
        from,
      }),
    [places, filter, sort, fits, props.suggestTotal, props.suggestOrder, from],
  );
  const items = useMemo(
    () => listItems(groups, props.sponsored?.poiId ?? null),
    [groups, props.sponsored?.poiId],
  );
  const counts = useMemo(() => placeCounts(places), [places]);
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

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'title') {
      const title =
        item.group === 'saved'
          ? savedGroupTitle(groups.saved.length)
          : item.group === 'plan'
            ? planGroupTitle(groups.plan.length)
            : suggestsGroupTitle(props.guide.name, props.suggestTotal ?? groups.suggests.length);
      return <GroupTitle title={title} testID={`places-group-${item.group}`} />;
    }
    if (item.kind === 'plan') return <PlanSummaryRow places={groups.plan} onPress={props.onPlan} />;
    const { place } = item;
    const poiId = place.poiId;
    const { onAdd, onSplit, onAction, sponsored } = props;
    return (
      <>
        <PlaceListRow
          place={place}
          meta={rowMeta(
            place.category,
            props.stay === null ? null : minutesBetween(props.stay.at, place),
          )}
          savers={saversOf(place)}
          fit={lineFor(place)}
          onOpen={() => props.onOpen(place, item.sponsored)}
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
          count={counts.all}
          inTrip={props.inTrip}
          hidden={props.hidden}
          onUnhide={props.onUnhide}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onEndReached={props.onLoadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}
        testID="places-list-rows"
      />
    </Scaffold>
  );
}
