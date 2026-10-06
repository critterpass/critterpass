/**
 * The input of a one-day redraft and what the planner makes of it before the guide is asked: the
 * day as it stands, the places offered for the new one (those beside the day's stops first: what
 * is offered decides how far the day travels), and the frame it is timed in.
 */
import type { DraftDay, Itinerary, RedraftReasonKey } from '@cp/domain';
import { choicesOfDay, isKept, withinReach, type DayChoice, type DraftPoi } from '@cp/planner';

import type { RedraftNoteAsk } from '../../decide/questions';
import { areasOf } from './areas';
import { noteReasons } from './redraft-asks';
import type { DraftPlanInput } from './context';
import { isOutdoors, wantsIndoors } from './redraft-rain';
import { frameFor } from './redraft-reasons';
import type { SkeletonDay } from './skeleton';

export interface ChatLine {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly at: string;
}

export interface RedraftPlanInput extends DraftPlanInput {
  readonly base: Itinerary;
  readonly dayNo: number;
  readonly reasons: readonly RedraftReasonKey[];
  readonly note: string | null;
  /** What the note asks, read once by a typed decision (`readRedraftNote`); none when absent. */
  readonly asks?: readonly RedraftNoteAsk[];
  readonly chat: readonly ChatLine[];
}

export function redraftDay(input: RedraftPlanInput): DraftDay {
  const day = input.base.days.find((d) => d.day_no === input.dayNo);
  if (day === undefined) throw new Error(`redraft: no day ${input.dayNo}`);
  return day;
}

export function redraftSkeletonDay(input: RedraftPlanInput): SkeletonDay {
  const day = redraftDay(input);
  const elsewhere = usedElsewhere(input);
  const open = (id: string) => (input.pools.openDays.get(id) ?? []).includes(day.day_no);
  const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
  const { capMin } = areasOf(input);
  const rain = wantsIndoors(input);
  const ring = (poi: DraftPoi) =>
    withinReach(poi.id, here, input.travel, Math.round(capMin / 2))
      ? 0
      : withinReach(poi.id, here, input.travel, capMin)
        ? 1
        : 2;
  const nearFirst = (pois: readonly DraftPoi[]) =>
    pois
      .filter((poi) => !elsewhere.has(poi.id) && open(poi.id))
      .map((poi, rank) => ({ poi, rank, ring: ring(poi), air: rain && isOutdoors(poi) ? 1 : 0 }))
      // On a rain redraft the places under a roof come first.
      .sort((a, b) => a.air - b.air || a.ring - b.ring || a.rank - b.rank)
      .map((entry) => entry.poi.id);
  return {
    dayNo: day.day_no,
    date: day.date,
    theme: day.theme,
    area: '',
    mustDoIds: day.items.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
    poiIds: nearFirst(input.pools.activities).slice(0, 12),
    mealIds: nearFirst(input.pools.eateries).slice(0, 8),
    spareIds: [],
  };
}

function usedElsewhere(input: RedraftPlanInput): Set<string> {
  return new Set(
    input.base.days
      .filter((d) => d.day_no !== input.dayNo)
      .flatMap((d) => d.items.map((item) => item.poi_id ?? '')),
  );
}

/**
 * The redraft's input as the planner times and checks it: the reasons her note asks for (its
 * labels) join the chips, and a later start opens the day later.
 */
export function plannedRedraft(input: RedraftPlanInput): RedraftPlanInput {
  const added = noteReasons(input.asks).filter((reason) => !input.reasons.includes(reason));
  const reasons = added.length === 0 ? input.reasons : [...input.reasons, ...added];
  const frame = frameFor(input.frame, input.dayNo, reasons);
  return frame === input.frame && reasons === input.reasons ? input : { ...input, reasons, frame };
}

/**
 * The reply's stops with the day's locked ones kept: a booking or a stop the organiser placed by
 * hand stays locked when the guide names it, and goes back in when the guide left it out (a
 * must-do is put back by the scheduler).
 */
export function withKept(base: DraftDay, choices: readonly DayChoice[]): DayChoice[] {
  const locked = choicesOfDay({
    items: base.items.filter((item) => item.must_do_id === null && isKept(item)),
  });
  const lockOf = new Map(locked.map((choice) => [choice.poiId, choice.lockedReason ?? null]));
  const named = new Set(choices.map((choice) => choice.poiId));
  return [
    ...choices.map((choice) =>
      lockOf.has(choice.poiId)
        ? { ...choice, lockedReason: lockOf.get(choice.poiId) ?? null }
        : choice,
    ),
    ...locked.filter((choice) => !named.has(choice.poiId)),
  ];
}
