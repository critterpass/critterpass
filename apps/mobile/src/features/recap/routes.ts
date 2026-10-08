/**
 * The recap area's routes and the design ids the navigation registry knows them by: the recap page
 * (3m-1) and its story (3m-3…3m-8), opened from Home's post-trip card, the trip hub after the trip, the passport stamps and
 * the recap-ready push (`/recap/<tripId>`); and the year-later memory (3m-10), opened from the
 * anniversary push (`/memory/<memoryId>?trip=<tripId>`). Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const recapRoutes = {
  /** `ended`: the story just finished, so the page hosts the story's end. */
  summary: (tripId: string, ended = false): Href => ({
    pathname: '/recap/[tripId]',
    params: ended ? { tripId, ended: '1' } : { tripId },
  }),
  /** `replay`: opened over the recap page, which closing the story goes back to. */
  story: (tripId: string, replay = false): Href => ({
    pathname: '/recap/[tripId]/story',
    params: replay ? { tripId, from: 'summary' } : { tripId },
  }),
  memory: (memoryId: string, tripId: string): Href => ({
    pathname: '/memory/[memoryId]',
    params: { memoryId, trip: tripId },
  }),
};

registerScreens({
  '3m-1': (params) => recapRoutes.summary(params['tripId'] ?? ''),
  '3m-10': (params) => recapRoutes.memory(params['memoryId'] ?? '', params['tripId'] ?? ''),
});
