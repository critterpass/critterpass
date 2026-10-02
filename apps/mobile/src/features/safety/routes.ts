/**
 * Help and crew SOS routes and the design ids the navigation registry knows them by: the Help hub
 * (3k-6, long-press on the guide button; it opens over the trip under way unless a trip is given)
 * and an SOS (3k-10, `/sos/{id}` as its push links it).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { HelpProblem } from '@cp/domain';
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const HELP_SCREEN = '3k-6';
export const SOS_SCREEN = '3k-10';

export const safetyRoutes = {
  help: (tripId?: string): Href =>
    tripId === undefined || tripId === '' ? '/help' : { pathname: '/help', params: { tripId } },
  checklist: (tripId: string, problem: HelpProblem): Href => ({
    pathname: '/help/[problem]',
    params: { problem, tripId },
  }),
  send: (tripId: string): Href => ({ pathname: '/sos/send', params: { tripId } }),
  /** `sent`: this phone just sent it (the screen says so until the incident syncs back). */
  sos: (sosId: string, sent = false): Href => ({
    pathname: '/sos/[id]',
    params: sent ? { id: sosId, sent: '1' } : { id: sosId },
  }),
  /** The session map of an SOS: free on any trip, it ends with the incident. */
  map: (sosId: string): Href => ({ pathname: '/sos/map', params: { id: sosId } }),
};

let registered = false;

/** Joins Help and SOS to the registry (once): the guide button's long-press needs 3k-6. */
export function registerSafetyScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens({
    [HELP_SCREEN]: (params) => safetyRoutes.help(params['tripId']),
    [SOS_SCREEN]: (params) => safetyRoutes.sos(params['sosId'] ?? params['id'] ?? ''),
  });
}
