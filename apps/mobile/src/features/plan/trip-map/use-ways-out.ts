/**
 * Where the plan's ways out lead, each shown only once its screen has joined the registry: the
 * plan check (7h-1), an issue's fixer (rain and crowds 7h-4, less driving 7h-3, fill a gap 7h-2),
 * Ideas (7f-2), search (7d-1), the places list (7c-3), a placed-ideas review (7h-7). Until then
 * the entry is hidden rather than a button that goes nowhere.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and params, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import { router, type Href } from 'expo-router';

import { useScreenHref, type ScreenParams } from '@/lib/navigation/screen-registry';

/** Opens `href`, or nothing while the screen isn't registered. */
export function opener(href: Href | undefined): (() => void) | null {
  return href === undefined ? null : () => router.push(href);
}

export function useWayOut(id: string, params: ScreenParams): (() => void) | null {
  return opener(useScreenHref(id, params));
}

/** The screen an issue's fix opens: its own fixer, else the plan check. */
export function fixerId(issue: PlanCheckIssue): string {
  if (issue.fix?.kind === 'screen') {
    switch (issue.fix.screen) {
      case 'rain_crowds':
        return '7h-4';
      case 'less_driving':
      case 'too_far':
        return '7h-3';
      case 'fill_gap':
        return '7h-2';
    }
  }
  if (issue.kind === 'rain' || issue.kind === 'crowds') return '7h-4';
  if (issue.kind === 'too_far') return '7h-3';
  return '7h-1';
}

export function issueParams(tripId: string, issue: PlanCheckIssue, dayNo: number): ScreenParams {
  return {
    tripId,
    issueId: issue.id,
    day: String(dayNo),
    ...(issue.day_id === null ? {} : { dayId: issue.day_id }),
  };
}

/** The fixer for `issue`, or null while it isn't registered (or there is no issue). */
export function useFixer(
  tripId: string,
  issue: PlanCheckIssue | null,
  dayNo: number,
): (() => void) | null {
  const href = useScreenHref(
    issue === null ? '' : fixerId(issue),
    issue === null ? {} : issueParams(tripId, issue, dayNo),
  );
  return issue === null ? null : opener(href);
}

/** FILL IT on a free slot (7h-2), with the day and the window. */
export function useFillGap(
  tripId: string,
  dayNo: number,
  dayId: string | null,
  window: { readonly from: number; readonly to: number },
): (() => void) | null {
  return useWayOut('7h-2', {
    tripId,
    day: String(dayNo),
    from: String(window.from),
    to: String(window.to),
    ...(dayId === null ? {} : { dayId }),
  });
}
