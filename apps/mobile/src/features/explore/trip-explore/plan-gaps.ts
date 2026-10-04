/**
 * The plan's free windows worked out on the phone from synced rows, with the same planner the
 * server runs (`assembleFitContext` + `dayGaps`): the current version's dated days and timed items,
 * who is on the trip, and straight-line "about" travel to see when people must leave for the next
 * item. Each gap keeps its day's date and the name of what the others are doing meanwhile.
 */
import {
  DEFAULT_FIT_THRESHOLDS,
  assembleFitContext,
  dayGaps,
  straightLineTravel,
} from '@cp/planner';

import type { DatedGap } from './trip-explore-model';

export interface GapItemRow {
  readonly stable_id: string;
  readonly day_id: string;
  readonly poi_id: string | null;
  readonly category: string | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly attendee_ids: readonly string[];
  readonly locked: boolean;
  readonly is_outdoor: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly name: string | null;
}

export interface PlanGapRows {
  readonly tz: string;
  readonly driveFactor: number;
  readonly participants: readonly string[];
  readonly days: readonly {
    readonly day_id: string;
    readonly day_no: number;
    readonly date: string | null;
  }[];
  readonly items: readonly GapItemRow[];
}

export interface PlanGap extends DatedGap {
  /** What the crewmates who are not free are doing (the first busy item), when it has a name. */
  readonly busyName: string | null;
}

function instant(value: string | null): Date | null {
  if (value === null) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function planGaps(rows: PlanGapRows): PlanGap[] {
  const context = assembleFitContext({
    tz: rows.tz,
    participants: rows.participants,
    driveFactor: rows.driveFactor,
    days: rows.days,
    items: rows.items.map((item) => ({
      ...item,
      starts_at: instant(item.starts_at),
      ends_at: instant(item.ends_at),
    })),
    stays: new Map(),
    rain: new Map(),
    monthFactors: new Map(),
    travel: straightLineTravel(rows.driveFactor, DEFAULT_FIT_THRESHOLDS.walkMaxM),
  });
  const names = new Map(rows.items.map((item) => [item.stable_id, item.name]));
  return context.days.flatMap((day) =>
    dayGaps(context, day).map(({ gap }) => ({
      gap,
      date: day.date,
      busyName: gap.busy.map((busy) => names.get(busy.stable_id) ?? null).find(Boolean) ?? null,
    })),
  );
}
