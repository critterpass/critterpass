/**
 * The proposal area's routes and the design screen ids the navigation registry knows them by:
 * the builder (3f-1), the trailer (3f-2), a member's own version (3f-3), slide to board (3f-5) and the organiser's
 * RSVP tracker (3f-6) with a dropout's change list (3f-7). A proposal opens by its id (`/proposal/{id}`, as its push links it); the
 * builder by its trip.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const proposalRoutes = {
  build: (tripId: string): Href => ({ pathname: '/proposal/build', params: { tripId } }),
  open: (proposalId: string): Href => ({ pathname: '/proposal/[id]', params: { id: proposalId } }),
  /** `options`: the savings the member took, carried to their RSVP. */
  board: (proposalId: string, options: readonly string[] = []): Href => ({
    pathname: '/proposal/[id]/board',
    params:
      options.length === 0 ? { id: proposalId } : { id: proposalId, options: options.join(',') },
  }),
  trailer: (proposalId: string): Href => ({
    pathname: '/proposal/[id]/trailer',
    params: { id: proposalId },
  }),
  dropout: (proposalId: string, uid: string): Href => ({
    pathname: '/proposal/[id]/dropout',
    params: { id: proposalId, uid },
  }),
  preview: (proposalId: string, uid: string): Href => ({
    pathname: '/proposal/[id]',
    params: { id: proposalId, as: uid },
  }),
  tracker: (proposalId: string): Href => ({
    pathname: '/proposal/[id]/tracker',
    params: { id: proposalId },
  }),
};

let registered = false;

/** Joins the proposal screens to the registry (once). */
export function registerProposalScreens(): void {
  if (registered) return;
  registered = true;
  const id = (params: Readonly<Record<string, string>>) =>
    params['proposalId'] ?? params['id'] ?? '';
  registerScreens({
    '3f-1': (params) => proposalRoutes.build(params['tripId'] ?? ''),
    '3f-2': (params) => proposalRoutes.trailer(id(params)),
    '3f-3': (params) => proposalRoutes.open(id(params)),
    '3f-5': (params) => proposalRoutes.board(id(params)),
    '3f-6': (params) => proposalRoutes.tracker(id(params)),
    '3f-7': (params) => proposalRoutes.dropout(id(params), params['uid'] ?? ''),
  });
}
