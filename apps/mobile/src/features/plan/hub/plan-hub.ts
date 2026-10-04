/**
 * What the trip's PLAN opens. With `planning.redesign` off: the earlier overview (3e-1). With it
 * on, `plan.hub` picks the trip map (7a-1) or a day plan (7b-1); the day plan opens on today while
 * the trip runs, else the first day with stops, else day 1.
 */
import type { PlanningSwitch } from '@/lib/navigation/planning-switch';

export type PlanEntry = 'overview' | 'map' | 'day';

export function planEntry(state: PlanningSwitch): PlanEntry {
  if (!state.redesign) return 'overview';
  return state.hub === 'day' ? 'day' : 'map';
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
