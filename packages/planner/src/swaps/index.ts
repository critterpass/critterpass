/**
 * Rain and crowds (7h-4): the day's blocks moved out of the wet hours and the busy hours. Each
 * outdoor block over likely rain and each block whose visit runs into its place's busy hours (with
 * a quiet stretch long enough that day) is first moved to the nearest dry or quiet start where it clashes with nobody
 * and the travel either side fits; failing that it trades places with a flexible block of the
 * same people (indoors when rain is why), the earlier start going to the later block and the
 * other following it after the drive between them. Booked and locked blocks never move; an
 * outdoor block never lands in a wetter hour than it had. Blocks are worked in time order, each
 * seeing the moves before it.
 */
import { openThrough, type ChangeSetOp } from '@cp/domain';

import { feasibleStart, retimeOp } from '../check/retime';
import { checkDays, itemOf, spansOf, travelFor, type CheckDay } from '../check/rules/shared';
import type { CheckInput } from '../check/types';
import { ceilGrid } from '../draft/day-minutes';
import type { CrowdSource, WeatherSource } from '../fit/context';
import { overlaps, type DayModel, type ModelItem } from '../fit/day-model';
import { slotIsBusy } from '../fit/reasons';
import { allowedSpans, crowdBars, crowdOf, rainLimit, wetWindow, wettest } from './windows';

export const SWAP_REASONS = [
  'dry_after',
  'dry_before',
  'quiet_before',
  'quiet_after',
  'indoors_in_rain',
  'trades_places',
] as const;
export type SwapReason = (typeof SWAP_REASONS)[number];

export type BlockProblem = 'rain' | 'crowds';

export interface SwapBlock {
  readonly stableId: string;
  readonly start: number;
  readonly end: number;
  readonly outdoor: boolean;
  /** Why it is in the way where it sits in that lane; null = it is fine there. */
  readonly problem: BlockProblem | null;
}

export interface DaySwap {
  readonly stableId: string;
  readonly from: number;
  readonly to: number;
  readonly reason: SwapReason;
  /** The block it traded places with, for a trade. */
  readonly withId: string | null;
}

export interface DaySwaps {
  readonly dayId: string;
  readonly dayNo: number;
  readonly rain: {
    readonly from: number;
    readonly to: number;
    readonly source: WeatherSource;
  } | null;
  readonly crowds: { readonly source: CrowdSource; readonly hourly: readonly number[] } | null;
  /** Local minute the busy run of the moved block's place starts, for "busy from 10". */
  readonly busyFrom: number | null;
  readonly now: readonly SwapBlock[];
  readonly swapped: readonly SwapBlock[];
  readonly swaps: readonly DaySwap[];
  readonly ops: readonly ChangeSetOp[];
}

function problemOf(check: CheckDay, item: ModelItem): BlockProblem | null {
  const outdoor = itemOf(check.day, item.stableId)?.outdoor === true;
  if (outdoor && wettest(check.day.rain, item.start, item.end) >= rainLimit(check)) return 'rain';
  const crowd = crowdOf(check, item);
  if (!slotIsBusy(crowd, item.start, item.end, check.input.thresholds.busyLevel)) return null;
  const quiet = allowedSpans(check, item, { outdoor, quiet: true });
  return quiet.some((span) => span.end - span.start >= item.end - item.start) ? 'crowds' : null;
}

const withTimes = (model: DayModel, times: ReadonlyMap<string, number>): DayModel => ({
  ...model,
  items: model.items
    .map((item) => {
      const start = times.get(item.stableId);
      return start === undefined ? item : { ...item, start, end: start + item.end - item.start };
    })
    .sort((a, b) => a.start - b.start || (a.stableId < b.stableId ? -1 : 1)),
});

/** Whether `item` can sit at `start` beside everyone else's blocks (the `skip` ones aside). */
function clear(
  check: CheckDay,
  model: DayModel,
  item: ModelItem,
  start: number,
  skip: ReadonlySet<string>,
): boolean {
  const end = start + item.end - item.start;
  if (start < check.day.fromMin || end > check.day.toMin) return false;
  const spans = spansOf(check, item);
  if (spans !== null && openThrough(spans, start, end) === null) return false;
  const travel = travelFor(check);
  const leg = (a: ModelItem, b: ModelItem) =>
    a.point === null || b.point === null
      ? 0
      : (travel({ key: a.stableId, ...a.point }, { key: b.stableId, ...b.point })?.minutes ?? 0);
  return model.items.every((other) => {
    if (other.stableId === item.stableId || skip.has(other.stableId)) return true;
    if (![...item.people].some((uid) => other.people.has(uid))) return true;
    if (overlaps(other, start, end)) return false;
    if (other.end <= start && start - other.end < leg(other, item)) return false;
    return !(other.start >= end && other.start - end < leg(item, other));
  });
}

const samePeople = (a: ModelItem, b: ModelItem) =>
  a.people.size === b.people.size && [...a.people].every((uid) => b.people.has(uid));

interface Trade {
  readonly moved: number;
  readonly partner: ModelItem;
  readonly partnerAt: number;
}

/** A flexible block to trade places with, nearest first; null when none works. */
function trade(
  check: CheckDay,
  model: DayModel,
  item: ModelItem,
  problem: BlockProblem,
  moved: ReadonlySet<string>,
): Trade | null {
  const outdoor = itemOf(check.day, item.stableId)?.outdoor === true;
  const allowed = allowedSpans(check, item, { outdoor, quiet: problem === 'crowds' });
  const travel = travelFor(check);
  const partners = model.items
    .filter(
      (other) => other.stableId !== item.stableId && !other.locked && !moved.has(other.stableId),
    )
    .filter((other) => samePeople(other, item))
    .filter((other) => problem !== 'rain' || itemOf(check.day, other.stableId)?.outdoor !== true)
    .sort((a, b) => Math.abs(a.start - item.start) - Math.abs(b.start - item.start));
  for (const partner of partners) {
    const [first, second] = item.start < partner.start ? [partner, item] : [item, partner];
    const firstAt = Math.min(item.start, partner.start);
    const firstEnd = firstAt + first.end - first.start;
    const minutes =
      first.point === null || second.point === null
        ? 0
        : (travel(
            { key: first.stableId, ...first.point },
            { key: second.stableId, ...second.point },
          )?.minutes ?? 0);
    const secondAt = ceilGrid(firstEnd + minutes);
    const itemAt = first === item ? firstAt : secondAt;
    const partnerAt = first === item ? secondAt : firstAt;
    const fitsAllowed = allowed.some(
      (span) => span.start <= itemAt && span.end >= itemAt + item.end - item.start,
    );
    const skip = new Set([item.stableId, partner.stableId]);
    const partnerDrier =
      itemOf(check.day, partner.stableId)?.outdoor !== true ||
      wettest(check.day.rain, partnerAt, partnerAt + partner.end - partner.start) <=
        wettest(check.day.rain, partner.start, partner.end);
    if (
      fitsAllowed &&
      partnerDrier &&
      clear(check, model, item, itemAt, skip) &&
      clear(check, model, partner, partnerAt, skip)
    ) {
      return { moved: itemAt, partner, partnerAt };
    }
  }
  return null;
}

function reasonOf(problem: BlockProblem, from: number, to: number): SwapReason {
  if (problem === 'rain') return to > from ? 'dry_after' : 'dry_before';
  return to < from ? 'quiet_before' : 'quiet_after';
}

const blocksOf = (check: CheckDay, model: DayModel): SwapBlock[] =>
  model.items.map((item) => ({
    stableId: item.stableId,
    start: item.start,
    end: item.end,
    outdoor: itemOf(check.day, item.stableId)?.outdoor === true,
    problem: problemOf(check, item),
  }));

export function swapCheckDay(check: CheckDay): DaySwaps {
  const times = new Map<string, number>();
  const swaps: DaySwap[] = [];
  let busyFrom: number | null = null;
  for (const original of check.model.items) {
    if (original.locked || times.has(original.stableId)) continue;
    const model = withTimes(check.model, times);
    const item = model.items.find((entry) => entry.stableId === original.stableId) ?? original;
    const problem = problemOf(check, item);
    if (problem === null) continue;
    const outdoor = itemOf(check.day, item.stableId)?.outdoor === true;
    const spans = allowedSpans(check, item, { outdoor, quiet: problem === 'crowds' });
    const move =
      spans.length === 0 ? null : feasibleStart(model, item, travelFor(check), spans, 'either');
    const traded = move === null ? trade(check, model, item, problem, new Set(times.keys())) : null;
    const to = move ?? traded?.moved ?? null;
    if (to === null) continue;
    times.set(item.stableId, to);
    swaps.push({
      stableId: item.stableId,
      from: original.start,
      to,
      reason: reasonOf(problem, original.start, to),
      withId: traded?.partner.stableId ?? null,
    });
    if (problem === 'crowds' && busyFrom === null) {
      const levels = crowdOf(check, item)?.levels ?? [];
      const busy = check.input.thresholds.busyLevel;
      let hour = Math.floor(original.start / 60);
      while (hour < 23 && (levels[hour] ?? 0) < busy) hour += 1;
      while (hour > 0 && (levels[hour - 1] ?? 0) >= busy) hour -= 1;
      busyFrom = hour * 60;
    }
    if (traded !== null) {
      times.set(traded.partner.stableId, traded.partnerAt);
      swaps.push({
        stableId: traded.partner.stableId,
        from: traded.partner.start,
        to: traded.partnerAt,
        reason: problem === 'rain' ? 'indoors_in_rain' : 'trades_places',
        withId: item.stableId,
      });
    }
  }
  const after = withTimes(check.model, times);
  const byId = new Map(check.model.items.map((item) => [item.stableId, item]));
  const ops = swaps.flatMap((swap) => {
    const item = byId.get(swap.stableId);
    return item === undefined
      ? []
      : [retimeOp(check.model, item, swap.to, check.context.tz, `check_fix_${swap.reason}`)];
  });
  const wet = wetWindow(check);
  return {
    dayId: check.day.dayId,
    dayNo: check.day.dayNo,
    rain:
      wet === null || check.day.rain === null ? null : { ...wet, source: check.day.rain.source },
    crowds: crowdBars(check),
    busyFrom,
    now: blocksOf(check, check.model),
    swapped: blocksOf(check, after),
    swaps,
    ops,
  };
}

/** The swaps of one day of the plan; null when the plan has no such day. */
export function swapDay(input: CheckInput, dayId: string): DaySwaps | null {
  const check = checkDays(input).find((entry) => entry.day.dayId === dayId);
  return check === undefined ? null : swapCheckDay(check);
}
