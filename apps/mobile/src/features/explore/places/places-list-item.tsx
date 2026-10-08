/**
 * One item of the places list (7c-3): a group's title, a plan day's title, the collapsed IN THE
 * PLAN row or a place. Memoised on the item, its photo and the list's shared facts, so a row
 * scrolling into view or a photo landing redraws only the rows it changes.
 */
import type { PlaceFit } from '@cp/domain';
import { memo } from 'react';

import type { FitLine } from '@/data/fit/fit-line';
import type { PlaceTilePhoto } from '@/data/media/use-place-tile-photos';

import { distanceMeters, type Point } from '../map-model';
import { minutesBetween } from './label-sync';
import type { ListItem } from './list-items';
import type { PlaceFacts } from './place-facts';
import type { ListOrder } from './place-groups';
import {
  bestTimeLine,
  inPlanLine,
  planDayTitle,
  planGroupTitle,
  rowMeta,
  savedGroupTitle,
  suggestsGroupTitle,
} from './places-copy';
import { GroupTitle, PlaceListRow, PlanSummaryRow, RowGap } from './places-list-rows';
import type { HubPlace } from './places-model';
import type { SwipeAction } from './swipe-actions';
import type { CrewMember } from './use-places-data';

/** What every row reads beside its own item: it changes with the data, never with scrolling. */
export interface ListRowFacts {
  readonly guideName: string;
  readonly savedCount: number;
  readonly suggestCount: number;
  readonly planned: readonly HubPlace[];
  readonly order: ListOrder;
  readonly from: Point | null;
  readonly stayAt: Point | null;
  readonly facts: ReadonlyMap<string, PlaceFacts> | undefined;
  readonly fits: ReadonlyMap<string, PlaceFit>;
  readonly lines: ReadonlyMap<string, FitLine>;
  readonly weekdays: ReadonlyMap<number, string>;
  readonly crew: ReadonlyMap<string, CrewMember>;
  readonly onOpen: (place: HubPlace, sponsored: boolean) => void;
  readonly onAdd: ((poiId: string) => void) | undefined;
  readonly onSplit: ((poiId: string) => void) | undefined;
  readonly onAction: ((place: HubPlace, action: SwipeAction) => void) | undefined;
  readonly onWhy: (() => void) | undefined;
  readonly onPlan: () => void;
}

export interface PlacesListItemProps {
  readonly item: ListItem;
  readonly photo: PlaceTilePhoto | undefined;
  readonly list: ListRowFacts;
}

function fitLineOf(place: HubPlace, list: ListRowFacts): FitLine | undefined {
  const fit = place.poiId === null ? undefined : list.fits.get(place.poiId);
  if (place.standing === 'suggested' && place.bestTime !== null && fit?.best) {
    return {
      text: bestTimeLine(place.bestTime, list.weekdays.get(fit.best.day_no) ?? null),
      tone: 'fits',
    };
  }
  return place.poiId === null ? undefined : list.lines.get(place.poiId);
}

export const PlacesListItem = memo(function PlacesListItem({
  item,
  photo,
  list,
}: PlacesListItemProps) {
  if (item.kind === 'title') {
    const title =
      item.group === 'saved'
        ? savedGroupTitle(list.savedCount)
        : item.group === 'plan'
          ? planGroupTitle(list.planned.length)
          : suggestsGroupTitle(list.guideName, list.suggestCount);
    return <GroupTitle title={title} testID={`places-group-${item.group}`} />;
  }
  if (item.kind === 'day') {
    return (
      <GroupTitle
        title={planDayTitle(
          item.dayNo,
          item.date,
          list.weekdays.get(item.dayNo) ?? null,
          item.count,
        )}
        testID={`places-plan-day-${String(item.dayNo)}`}
      />
    );
  }
  if (item.kind === 'plan') {
    // The summary opens the plan's own filter: the stops by day, here in the list.
    return <PlanSummaryRow places={list.planned} onPress={list.onPlan} />;
  }
  const { place } = item;
  const poiId = place.poiId;
  const { onAdd, onSplit, onAction, onWhy } = list;
  return (
    <>
      <PlaceListRow
        place={place}
        meta={rowMeta(
          place.category,
          list.stayAt === null ? null : minutesBetween(list.stayAt, place),
          list.facts?.get(poiId ?? place.id)?.area ?? null,
          list.order === 'nearest' && list.from !== null ? distanceMeters(list.from, place) : null,
        )}
        planned={
          place.standing === 'plan'
            ? inPlanLine(
                place.dayNo,
                place.dayNo === null ? null : (list.weekdays.get(place.dayNo) ?? null),
              )
            : undefined
        }
        photo={photo}
        savers={place.backerIds.map((uid) => ({
          key: uid,
          name: list.crew.get(uid)?.name ?? '',
          joinIndex: list.crew.get(uid)?.joinIndex ?? 0,
        }))}
        fit={fitLineOf(place, list)}
        onOpen={
          poiId === null && place.standing === 'plan'
            ? undefined
            : () => list.onOpen(place, item.sponsored)
        }
        onAdd={onAdd === undefined || poiId === null ? undefined : () => onAdd(poiId)}
        onSplit={onSplit === undefined || poiId === null ? undefined : () => onSplit(poiId)}
        onAction={
          onAction === undefined || poiId === null ? undefined : (action) => onAction(place, action)
        }
        sponsored={item.sponsored && onWhy !== undefined ? { onWhy } : undefined}
        testID={item.testID}
      />
      <RowGap />
    </>
  );
});
