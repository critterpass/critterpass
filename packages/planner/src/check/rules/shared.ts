/** What every rule reads of one day: its model, its items' places and the trip's travel. */
import { openSpans, type OpenSpan } from '@cp/domain';

import { travelOf, type FitContext, type FitDay, type FitItem } from '../../fit/context';
import { buildDayModel, type DayModel, type ModelItem } from '../../fit/day-model';
import type { CheckInput, CheckPlace } from '../types';

export interface CheckDay {
  readonly day: FitDay;
  readonly model: DayModel;
  readonly input: CheckInput;
  readonly context: FitContext;
}

export function checkDays(input: CheckInput): CheckDay[] {
  const { context } = input;
  return context.days.map((day) => ({
    day,
    model: buildDayModel(day, context.participants, context.tz),
    input,
    context,
  }));
}

export function itemOf(day: FitDay, stableId: string): FitItem | undefined {
  return day.items.find((item) => item.stableId === stableId);
}

export function placeOf(check: CheckDay, item: ModelItem): CheckPlace | null {
  const poiId = itemOf(check.day, item.stableId)?.poiId;
  return poiId === null || poiId === undefined ? null : (check.input.places.get(poiId) ?? null);
}

/** The item's opening spans that day; null when its hours are unknown. */
export function spansOf(check: CheckDay, item: ModelItem): readonly OpenSpan[] | null {
  const hours = placeOf(check, item)?.hours ?? null;
  return hours === null ? null : openSpans(hours, check.day.date);
}

export const travelFor = (check: CheckDay) => travelOf(check.context);
