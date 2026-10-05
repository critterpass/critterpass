/**
 * A block put on a day at a time the fit did not choose (a picked time, or a day with no free
 * slot): where it starts when nothing says (after the day's last stop, never on top of the
 * morning), and what adding it there does to the rest of that day. Later stops are pushed only as
 * far as they need, and a time that would run into the stop before it, a booking or a must-do
 * can't be added as it is: an add never leaves two stops overlapping.
 */
import type { DayFit, PlanOp } from '@cp/domain';

import { dayItems, type DayItem } from '@/data/plan/plan-model';
import type { TripPlan } from '@/data/plan/use-trip-plan';

import { retime } from '../day-plan/reschedule';
import { travelMinutes } from '../day/fit-check';
import type { ChangePreview } from '../day/item-detail-sheet';
import { retimePreview } from '../day/retime-copy';
import { clockOf, FALLBACK_START_MIN } from './add-model';

const LATEST_START_MIN = 21 * 60;
/** More stops than a day holds: how many times a suggestion is moved on to the next free start. */
const MAX_TRIES = 12;
const QUARTER = 15;

/** Where a block starts on a day nothing fits it into: after the day's last stop when that is not too late. */
export function openStartOn(plan: TripPlan, dayNo: number, tz: string): number {
  const ends = dayItems(plan.state, dayNo, plan.display, tz).flatMap((stop) =>
    stop.end === null ? [] : [stop.end],
  );
  if (ends.length === 0) return FALLBACK_START_MIN;
  const after = Math.ceil(Math.max(...ends) / QUARTER) * QUARTER;
  return after <= LATEST_START_MIN ? after : FALLBACK_START_MIN;
}

export interface IntoDay {
  /** The moves of the stops the new block pushes later. */
  readonly ops: readonly PlanOp[];
  /** Said under WHY when something moves or the block can't go there; null when nothing does. */
  readonly line: string | null;
  readonly blocked: boolean;
  /** The first start that works, when the chosen one is taken. */
  readonly useStart?: number;
}

export interface LooseBlock {
  readonly stableId: string;
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly place: { readonly lat: number; readonly lng: number } | null;
}

/** `block` timed against `day`; null when there is no day or block to time. */
export function addIntoDay(input: {
  readonly plan: TripPlan;
  readonly day: { readonly dayNo: number; readonly date: string } | null;
  readonly tz: string;
  readonly locale: string;
  readonly block: LooseBlock | null;
  /** The start is the fit's own suggestion: only a real overlap refuses it or moves a stop. */
  readonly fitted?: boolean;
}): IntoDay | null {
  if (input.day === null || input.block === null) return null;
  return timeInto({ ...input, day: input.day, block: input.block });
}

function timeInto(input: {
  readonly plan: TripPlan;
  readonly day: { readonly dayNo: number; readonly date: string };
  readonly tz: string;
  readonly locale: string;
  readonly block: LooseBlock;
  readonly fitted?: boolean;
}): IntoDay {
  const { plan, day, tz, block } = input;
  const there = dayItems(plan.state, day.dayNo, plan.display, tz);
  const arriving: DayItem = {
    stableId: block.stableId,
    dayNo: day.dayNo,
    title: block.title,
    category: null,
    start: null,
    end: null,
    tz,
    lane: null,
    attendeeIds: [],
    lock: null,
    status: 'confirmed',
    byGuide: false,
    notes: null,
    poiId: null,
    place: block.place,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
  const stops = [...there, arriving];
  const straight = travelMinutes(stops);
  const result = retime(
    stops,
    { stableId: block.stableId, start: block.start, end: block.end },
    day,
    (from, to) => straight(from.stableId, to.stableId) ?? 0,
    { fitted: input.fitted === true },
  );
  const preview: ChangePreview = retimePreview(result, input.locale, null);
  if (!result.ok) {
    return {
      ops: [],
      line: preview.line,
      blocked: true,
      ...(preview.useStart === undefined ? {} : { useStart: preview.useStart }),
    };
  }
  return { ops: result.ops, line: result.pushed === 0 ? null : preview.line, blocked: false };
}

/** The fit did not find this slot free as it is: no slot that day, or one that moves a stop. */
export function needsTiming(shown: DayFit | null): boolean {
  return shown === null || shown.grade === 'no' || shown.needs_move != null;
}

/** The block to time: the place at the chosen start; null when there is nothing to time. */
export function looseBlock(
  choice: { readonly startMin: number } | null,
  subject: { readonly name: string; readonly lat: number; readonly lng: number } | null,
  stableId: string,
  lengthMin: number,
): LooseBlock | null {
  if (choice === null || subject === null) return null;
  return {
    stableId,
    title: subject.name,
    start: choice.startMin,
    end: choice.startMin + lengthMin,
    place: { lat: subject.lat, lng: subject.lng },
  };
}

/**
 * The choice the sheet shows and what adding it does to its day. One rule for the suggestion and
 * the refusal: a time the fit chose is trusted as it is (only a real overlap moves it or a stop),
 * and when the first suggestion cannot go where it was put, it becomes the first start that can,
 * so what the sheet opens on can always be added. A time the person picked is never moved for
 * them: the sheet says why it can't be added and offers the first start that works.
 */
export function settleAdd<
  Choice extends { readonly startMin: number; readonly timePicked: boolean },
>(input: {
  readonly plan: TripPlan;
  readonly day: { readonly dayNo: number; readonly date: string } | null;
  readonly tz: string;
  readonly locale: string;
  readonly first: Choice | null;
  readonly shown: DayFit | null;
  readonly subject: { readonly name: string; readonly lat: number; readonly lng: number } | null;
  readonly stableId: string;
  readonly lengthMin: number;
  /** Nothing to time: the place is already a stop, no day takes it, or the fit is on its way. */
  readonly skip: boolean;
}): { readonly choice: Choice | null; readonly into: IntoDay | null } {
  const { first, shown } = input;
  if (first === null || input.skip) return { choice: first, into: null };
  if (!first.timePicked && !needsTiming(shown)) return { choice: first, into: null };
  const timed = (choice: Choice, fitted: boolean) =>
    addIntoDay({
      plan: input.plan,
      day: input.day,
      tz: input.tz,
      locale: input.locale,
      block: looseBlock(choice, input.subject, input.stableId, input.lengthMin),
      fitted,
    });
  const fitted = !first.timePicked && shown !== null && shown.grade !== 'no';
  let choice = first;
  let into = timed(first, fitted);
  // The first start that works may fall behind the next stop: follow it until one can be added.
  for (let tries = 0; tries < MAX_TRIES && !first.timePicked; tries += 1) {
    if (into?.useStart === undefined) break;
    choice = { ...choice, startMin: into.useStart };
    into = timed(choice, false);
  }
  return { choice, into };
}

/** The one-tap way to the first start that works, when the chosen time is taken. */
export function useStartOf(
  into: IntoDay | null,
  onUse: (start: number) => void,
): { readonly time: string; readonly onPress: () => void } | null {
  const start = into?.useStart;
  return start === undefined ? null : { time: clockOf(start), onPress: () => onUse(start) };
}
