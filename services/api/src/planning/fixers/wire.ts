/**
 * The fixer screens' answers on the wire: local minutes become instants in the trip's zone (and
 * `HH:MM` for the chart's labels); everything else is ids, numbers and codes the app words.
 */
import type { ChangeSetOp } from '@cp/domain';
import {
  instantAt,
  type DayReorder,
  type DaySwaps,
  type FitDay,
  type SwapBlock,
  type TooFarAlternative,
} from '@cp/planner';

const clock = (minute: number) => {
  const wrapped = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** Days before a day that its forecast firms up: the screen rechecks then. */
export const RECHECK_DAYS_BEFORE = 3;

const addDays = (date: string, days: number) => {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

export function reorderWire(day: FitDay, tz: string, reorder: DayReorder | null) {
  const iso = (minute: number) => instantAt(day.date, minute, tz).toISOString();
  if (reorder === null) return { day_id: day.dayId, found: false as const };
  return {
    day_id: day.dayId,
    found: true as const,
    before: { order: reorder.before.order, drive_min: reorder.before.driveMin },
    after: {
      order: reorder.after.order,
      drive_min: reorder.after.driveMin,
      schedule: reorder.after.schedule.map((slot) => ({
        stable_id: slot.stableId,
        starts_at: iso(slot.start),
        ends_at: iso(slot.end),
      })),
    },
    locked: reorder.locked,
    was: reorder.was.map((entry) => ({
      stable_id: entry.stableId,
      position: entry.position,
      starts_at: iso(entry.start),
    })),
    ops: reorder.ops,
  };
}

export interface WeatherSet {
  readonly change_set_id: string;
  readonly ops: readonly ChangeSetOp[];
}

export function swapsWire(day: FitDay, tz: string, swaps: DaySwaps, weather: WeatherSet | null) {
  const iso = (minute: number) => instantAt(day.date, minute, tz).toISOString();
  const block = (entry: SwapBlock) => ({
    stable_id: entry.stableId,
    starts_at: iso(entry.start),
    ends_at: iso(entry.end),
    outdoor: entry.outdoor,
    problem: entry.problem,
  });
  return {
    day_id: day.dayId,
    rain:
      swaps.rain === null
        ? null
        : {
            from: clock(swaps.rain.from),
            to: clock(swaps.rain.to),
            source: swaps.rain.source,
            ...(swaps.rain.source === 'normals'
              ? { recheck_on: addDays(day.date, -RECHECK_DAYS_BEFORE) }
              : {}),
          },
    crowds: swaps.crowds,
    busy_from: swaps.busyFrom === null ? null : clock(swaps.busyFrom),
    now: swaps.now.map(block),
    swapped: swaps.swapped.map(block),
    swaps: swaps.swaps.map((swap) => ({
      stable_id: swap.stableId,
      from: clock(swap.from),
      to: clock(swap.to),
      reason_code: swap.reason,
      with_id: swap.withId,
    })),
    ops: swaps.ops,
    weather,
  };
}

export function tooFarWire(
  alternative: TooFarAlternative | null,
  names: ReadonlyMap<string, string>,
) {
  if (alternative === null) return { found: false as const };
  return {
    found: true as const,
    day_id: alternative.dayId,
    stable_id: alternative.stableId,
    from_poi_id: alternative.fromPoiId,
    poi_id: alternative.poiId,
    name: names.get(alternative.poiId) ?? null,
    drive_before_min: alternative.driveBefore,
    drive_after_min: alternative.driveAfter,
    leg_in_min: alternative.legInMin,
  };
}
