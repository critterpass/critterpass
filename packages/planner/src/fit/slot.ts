/**
 * Slot search on the 15-minute grid: every start where the place is open for the whole visit,
 * enough people are free (nobody is put into an item they are going to), and the travel from the
 * stop before and to the stop after fits. A single flexible item in the way is reported as a
 * move, never overlapped; a locked item is never overlapped at all.
 */
import { openThrough, type OpenSpan } from '@cp/domain';

import { ceilGrid, GRID_MIN } from '../draft/day-minutes';
import type { FitLeg, FitPlace, FitStop, FitTravel } from './context';
import { nextItem, overlaps, previousItem, type DayModel, type ModelItem } from './day-model';

export interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly span: OpenSpan;
  /** Who the slot is for. */
  readonly who: readonly string[];
  readonly prev: ModelItem | null;
  readonly next: ModelItem | null;
  /** Travel in: from the stop before, else from the stay. */
  readonly legIn: FitLeg | null;
  readonly legOut: FitLeg | null;
  /** Least spare minutes on either side; null = nothing to travel to or from. */
  readonly slack: number | null;
  /** Extra minutes against going straight from the stop before to the stop after. */
  readonly detour: number | null;
  /** A flexible item that has to move to make room. */
  readonly needsMove: ModelItem | null;
}

export interface SlotSearch {
  readonly model: DayModel;
  readonly place: FitPlace;
  readonly spans: readonly OpenSpan[];
  readonly visitMin: number;
  readonly travel: FitTravel;
}

const stopOf = (item: ModelItem): FitStop | null =>
  item.point === null ? null : { key: item.stableId, ...item.point };

function minFree(everyone: readonly string[]): number {
  return Math.min(2, everyone.length);
}

/** Who is free for `[start, end)`, and the one flexible item in the way if moving it frees all. */
function whoFree(model: DayModel, start: number, end: number) {
  const inWay = model.items.filter((item) => overlaps(item, start, end));
  const busy = new Set(inWay.flatMap((item) => [...item.people]));
  const free = model.everyone.filter((uid) => !busy.has(uid));
  const movable = inWay.length === 1 && inWay[0]?.locked === false ? inWay[0] : null;
  return { free, movable };
}

function legsFit(
  search: SlotSearch,
  start: number,
  end: number,
  who: readonly string[],
  skip: string | undefined,
): Omit<Candidate, 'start' | 'end' | 'span' | 'who' | 'needsMove'> | null {
  const { model, place, travel } = search;
  const here: FitStop = { key: place.poiId ?? 'place', ...place.point };
  const prev = previousItem(model, start, who, skip);
  const next = nextItem(model, end, who, skip);
  const prevStop = prev === null ? null : stopOf(prev);
  const fromStop =
    prev === null && model.day.stay !== null ? { key: 'stay', ...model.day.stay } : prevStop;
  const legIn = fromStop === null ? null : travel(fromStop, here);
  const nextStop = next === null ? null : stopOf(next);
  const legOut = nextStop === null ? null : travel(here, nextStop);
  const departs = prev === null ? model.day.fromMin : prev.end;
  const slackIn = legIn === null ? null : start - departs - legIn.minutes;
  const slackOut = legOut === null || next === null ? null : next.start - end - legOut.minutes;
  if ((slackIn !== null && slackIn < 0) || (slackOut !== null && slackOut < 0)) return null;
  const slacks = [slackIn, slackOut].filter((value): value is number => value !== null);
  const direct = prevStop !== null && nextStop !== null ? travel(prevStop, nextStop) : null;
  const detour =
    direct === null || legIn === null || legOut === null || prev === null
      ? null
      : Math.max(0, legIn.minutes + legOut.minutes - direct.minutes);
  return {
    prev,
    next,
    legIn,
    legOut,
    slack: slacks.length === 0 ? null : Math.min(...slacks),
    detour,
  };
}

/** Every feasible start on the day, earliest first. */
export function candidates(search: SlotSearch): Candidate[] {
  const { model, spans, visitMin } = search;
  const found: Candidate[] = [];
  const need = minFree(model.everyone);
  for (
    let start = ceilGrid(model.day.fromMin);
    start + visitMin <= model.day.toMin;
    start += GRID_MIN
  ) {
    const end = start + visitMin;
    const span = openThrough(spans, start, end);
    if (span === null) continue;
    const { free, movable } = whoFree(model, start, end);
    const options: { who: readonly string[]; needsMove: ModelItem | null }[] = [];
    if (free.length >= need && need > 0) options.push({ who: free, needsMove: null });
    else if (movable !== null) options.push({ who: model.everyone, needsMove: movable });
    for (const option of options) {
      const legs = legsFit(search, start, end, option.who, option.needsMove?.stableId);
      if (legs === null) continue;
      found.push({ start, end, span, who: option.who, needsMove: option.needsMove, ...legs });
    }
  }
  return found;
}

/** Whether the place keeps a span long enough for a visit at all that date. */
export function opensLongEnough(search: SlotSearch): boolean {
  return search.spans.some((span) => span.end - span.start >= search.visitMin);
}
