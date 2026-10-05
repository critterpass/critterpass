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
import { FALLBACK_START_MIN } from './add-model';

const LATEST_START_MIN = 21 * 60;
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
  );
  const preview: ChangePreview = retimePreview(result, input.locale, null);
  if (!result.ok) return { ops: [], line: preview.line, blocked: true };
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
