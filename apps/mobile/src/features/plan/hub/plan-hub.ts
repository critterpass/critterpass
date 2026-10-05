/**
 * What the trip's PLAN opens: `plan.hub` picks the trip map (7a-1) or a day plan (7b-1); the day
 * plan opens on today while the trip runs, else the first day with stops, else day 1.
 */
export type PlanEntry = 'map' | 'day';

/** Only `day` opens the day plan; anything else, the trip map. */
export function planEntry(hub: string): PlanEntry {
  return hub === 'day' ? 'day' : 'map';
}

export interface HubDay {
  readonly dayNo: number;
  readonly date: string | null;
  readonly stops: number;
}

/** The day a day-first hub opens on; null when the plan has no days. */
export function hubDay(days: readonly HubDay[], today: string | null): number | null {
  const todays = today === null ? undefined : days.find((day) => day.date === today);
  if (todays !== undefined) return todays.dayNo;
  return days.find((day) => day.stops > 0)?.dayNo ?? days[0]?.dayNo ?? null;
}
