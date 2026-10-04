/** Ideas (7f-2) and Tokek placing them (7h-6), under the trip. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export const ideasRoute = (tripId: string): Href => `/${tripId}/ideas` as Href;

export const placingRoute = (tripId: string, jobId: string): Href =>
  `/${tripId}/ideas/placing/${jobId}` as Href;
