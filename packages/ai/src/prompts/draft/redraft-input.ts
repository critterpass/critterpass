/**
 * The input of a one-day redraft and what the planner makes of it before the guide is asked: the
 * day as it stands, the places offered for the new one (those beside the day's stops first: what
 * is offered decides how far the day travels), and the frame it is timed in.
 */
import type { DraftDay, Itinerary, RedraftReasonKey } from '@cp/domain';
import { withinReach, type DraftPoi } from '@cp/planner';

import { areasOf } from './areas';
import type { DraftPlanInput } from './context';
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
  const ring = (poi: DraftPoi) =>
    withinReach(poi.id, here, input.travel, Math.round(capMin / 2))
      ? 0
      : withinReach(poi.id, here, input.travel, capMin)
        ? 1
        : 2;
  const nearFirst = (pois: readonly DraftPoi[]) =>
    pois
      .filter((poi) => !elsewhere.has(poi.id) && open(poi.id))
      .map((poi, rank) => ({ poi, rank, ring: ring(poi) }))
      .sort((a, b) => a.ring - b.ring || a.rank - b.rank)
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

/** The redraft's input as the planner times and checks it (a later start opens the day later). */
export function plannedRedraft(input: RedraftPlanInput): RedraftPlanInput {
  const frame = frameFor(input.frame, input.dayNo, input.reasons);
  return frame === input.frame ? input : { ...input, frame };
}
