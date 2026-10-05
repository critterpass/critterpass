/**
 * The way from a plan check card to the stop it is about: the day plan with that stop's sheet
 * open, or the day itself for an issue about the whole day. Null when the issue's day is not one
 * of the plan's.
 */
import type { PlanCheckIssue } from '@cp/domain';
import type { Href } from 'expo-router';

import { planRoutes } from '../overview/routes';

export function stopHref(
  tripId: string,
  days: readonly { readonly id: string; readonly day_no: number }[],
  issue: Pick<PlanCheckIssue, 'day_id' | 'stable_ids'>,
): Href | null {
  const day = days.find((row) => row.id === issue.day_id);
  if (day === undefined) return null;
  const stop = issue.stable_ids[0];
  const path = planRoutes.day(tripId, day.day_no) as string;
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route param, never copy.
  return stop === undefined ? path : `${path}?item=${stop}`;
}
