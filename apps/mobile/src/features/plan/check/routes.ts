/** The plan check (7h-1) and its fixer screens (7h-2 … 7h-5), under the trip. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export const checkRoutes = {
  check: (tripId: string) => `/${tripId}/check` as Href,
  lessDriving: (tripId: string, dayId: string) => `/${tripId}/check/less-driving/${dayId}` as Href,
  rain: (tripId: string, dayId: string) => `/${tripId}/check/rain/${dayId}` as Href,
  /** `day` (the day's number) stands in while the caller has no day id yet. */
  gap: (tripId: string, gap: { dayId: string; day?: string; start: string; end: string }) =>
    `/${tripId}/check/gap?dayId=${encodeURIComponent(gap.dayId)}&day=${encodeURIComponent(gap.day ?? '')}&start=${encodeURIComponent(gap.start)}&end=${encodeURIComponent(gap.end)}` as Href,
  balance: (tripId: string) => `/${tripId}/check/balance` as Href,
};
