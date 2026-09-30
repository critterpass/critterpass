/**
 * Plan routes under the trip (`/{tripId}/...`) and the design ids the navigation registry knows
 * them by. The day view and the decision view are built beside this area; they are linked by path.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

export const planRoutes = {
  plan: (tripId: string) => `/${tripId}/plan` as Href,
  review: (tripId: string, changesetId: string) => `/${tripId}/review/${changesetId}` as Href,
  day: (tripId: string, dayNo: number) => `/${tripId}/day/${dayNo}` as Href,
  decide: (tripId: string, pollId: string) => `/${tripId}/decide/${pollId}` as Href,
  setup: (tripId: string) => `/${tripId}/setup` as Href,
  draft: (tripId: string) => `/${tripId}/draft` as Href,
};

/** 3e-1 (the overview) and 3e-3 (review changes). */
export const PLAN_SCREENS = {
  '3e-1': (params: Readonly<Record<string, string>>) => planRoutes.plan(params['tripId'] ?? ''),
  '3e-3': (params: Readonly<Record<string, string>>) =>
    planRoutes.review(params['tripId'] ?? '', params['changesetId'] ?? ''),
} as const;

/**
 * Where a `/trip/{id}/<rest>` link (pushes, inbox items) lands: the trip's own `/{id}/<rest>`,
 * each segment re-encoded and the query kept.
 */
export function tripLinkTarget(
  tripId: string,
  rest: string | readonly string[] | undefined,
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
): string {
  const list = (value: string | readonly string[] | undefined): readonly string[] =>
    value === undefined ? [] : typeof value === 'string' ? [value] : value;
  const segments = list(rest);
  const tail = segments.map(encodeURIComponent).join('/');
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const one of list(value)) {
      search.append(key, one);
    }
  }
  const qs = search.toString();
  return `/${encodeURIComponent(tripId)}${tail === '' ? '' : `/${tail}`}${qs === '' ? '' : `?${qs}`}`;
}
