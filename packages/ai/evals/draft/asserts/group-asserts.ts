/**
 * Graders for a trip planned in day groups: every day holds only its own group's places, no place
 * is on two groups' days, a day trip's stops sit between reaching the area and starting back and
 * the day has its lunch, and the first day at a later stop starts after the crew gets there.
 */
import { mealAt, minuteOfDate } from '@cp/planner';

import type { DayGroup } from '../../../src/prompts/draft/groups';
import type { DraftPlanResult } from '../../../src/prompts/draft/pipeline';

export interface GroupExpect {
  readonly dayTrip?: {
    readonly dayNo: number;
    readonly fromMin: number;
    readonly untilMin: number;
  };
  readonly arrival?: { readonly dayNo: number; readonly fromMin: number };
}

export function gradeGroups(
  groups: readonly DayGroup[],
  result: DraftPlanResult,
  expect: GroupExpect,
): string[] {
  const failures: string[] = [];
  const tz = result.input.frame.tz;
  const groupOf = (dayNo: number) => groups.find((group) => group.dayNos.includes(dayNo));
  const seen = new Map<string, DayGroup>();
  const days = result.itinerary.days;
  const expected = groups.flatMap((group) => group.dayNos).sort((a, b) => a - b);
  if (days.map((day) => day.day_no).join() !== expected.join()) {
    failures.push(`days ${days.map((day) => day.day_no).join()} are not ${expected.join()}`);
  }
  for (const day of days) {
    const group = groupOf(day.day_no);
    for (const item of day.items) {
      if (item.poi_id === null || group === undefined) continue;
      if (!group.input.pois.has(item.poi_id)) {
        failures.push(`day ${day.day_no} holds ${item.poi_id}, not a place of its group`);
      }
      const other = seen.get(item.poi_id);
      if (other !== undefined && other !== group) {
        failures.push(`${item.poi_id} is on the days of two groups`);
      }
      seen.set(item.poi_id, group);
    }
  }
  const at = (iso: string, date: string) => minuteOfDate(new Date(iso), date, tz);
  if (expect.dayTrip !== undefined) {
    const { dayNo, fromMin, untilMin } = expect.dayTrip;
    const day = days.find((d) => d.day_no === dayNo);
    if (day === undefined || day.items.length === 0)
      failures.push(`day trip day ${dayNo} is empty`);
    for (const item of day?.items ?? []) {
      if (at(item.starts_at, day?.date ?? '') < fromMin) {
        failures.push(`day ${dayNo}: a stop starts before the area is reached`);
      }
      if (at(item.ends_at, day?.date ?? '') > untilMin) {
        failures.push(`day ${dayNo}: a stop ends after the crew must start back`);
      }
    }
    const lunched = (day?.items ?? []).some(
      (item) => item.kind === 'meal' && mealAt(at(item.starts_at, day?.date ?? '')) === 'lunch',
    );
    if (!lunched) failures.push(`day trip day ${dayNo} has no lunch`);
  }
  if (expect.arrival !== undefined) {
    const { dayNo, fromMin } = expect.arrival;
    const day = days.find((d) => d.day_no === dayNo);
    const first = day?.items[0];
    if (first !== undefined && at(first.starts_at, day?.date ?? '') < fromMin) {
      failures.push(`day ${dayNo} starts before the crew reaches the next stop`);
    }
  }
  return failures;
}
