/**
 * Where Add to plan starts from: the preset its route gave (a day, a time, "right after this
 * stop"), else the day of the screen it was opened over, and the stop the place already has in the
 * plan, which makes the sheet a move.
 */
import type { PlanDayRow, PlanItemRow } from '@/data/plan/queries';
import { minutesOnDay } from '@/data/plan/plan-model';

import { stopOfPlace, type AddDay, type AddPreset, type PlacedStop } from './add-model';
import { resolvePreset, type RoutePreset } from './routes';
import type { AddSubject } from './use-add-subject';

export interface AddTargetInput {
  readonly route: RoutePreset;
  /** The plan day id of the screen the sheet was opened over, when that screen is about one day. */
  readonly origin: string | undefined;
  readonly afterStableId: string | undefined;
  readonly subject: AddSubject | null;
  readonly days: readonly AddDay[];
  readonly tz: string;
  readonly dayRows: readonly PlanDayRow[];
  readonly itemRows: readonly PlanItemRow[];
  readonly titleOf: (stableId: string) => string | null;
}

export function addTarget(input: AddTargetInput): {
  readonly preset: AddPreset;
  readonly existing: PlacedStop | null;
} {
  const { route, origin, days, tz, itemRows, subject } = input;
  const dateOf = (dayNo: number | undefined) =>
    days.find((entry) => entry.dayNo === dayNo)?.date ?? null;
  const given = resolvePreset(
    route.dayNo === undefined && route.dayId === undefined ? { ...route, dayId: origin } : route,
    input.dayRows,
    tz,
  );
  const afterRow = itemRows.find((row) => row.stable_id === input.afterStableId);
  const afterDate = dateOf(afterRow?.day_no);
  const row = subject === null ? undefined : stopOfPlace(subject, itemRows, input.titleOf);
  const date = dateOf(row?.day_no);
  return {
    preset:
      afterRow?.ends_at != null && afterDate !== null
        ? {
            after: {
              dayNo: afterRow.day_no,
              endMin: minutesOnDay(afterRow.ends_at, tz, afterDate),
            },
          }
        : given,
    existing:
      row?.starts_at == null || date === null
        ? null
        : {
            stableId: row.stable_id,
            dayNo: row.day_no,
            startMin: minutesOnDay(row.starts_at, tz, date),
          },
  };
}
