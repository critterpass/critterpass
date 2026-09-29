/**
 * The vote area's routes and the design screen ids the navigation registry knows them by: the
 * pitch sheet (3b-3), the showdown (3c-1), the winner reveal (3c-2), place search (3b-7) and the
 * guest guide's place page (3b-8). The live guide's destination page (3d-1) is another area's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

export const voteRoutes = {
  newPoll: (crewId: string): Href => ({ pathname: '/vote/new-poll', params: { crewId } }),
  pitch: (crewId: string, placeId?: string): Href => ({
    pathname: '/vote/pitch',
    params: placeId === undefined ? { crewId } : { crewId, placeId },
  }),
  showdown: (pollId: string): Href => ({ pathname: '/vote/[pollId]', params: { pollId } }),
  reveal: (pollId: string): Href => ({ pathname: '/vote/[pollId]/reveal', params: { pollId } }),
  search: (crewId?: string): Href => ({
    pathname: '/places/search',
    params: crewId === undefined ? {} : { crewId },
  }),
  place: (placeId: string, crewId?: string): Href => ({
    pathname: '/places/[placeId]',
    params: crewId === undefined ? { placeId } : { placeId, crewId },
  }),
  /** A live guide's destination page (another area's 3d-1); the place page until it exists. */
  destination: (placeId: string, crewId?: string): Href =>
    hrefFor('3d-1', { placeId }) ?? voteRoutes.place(placeId, crewId),
  /** Trip setup (another area's 3c-3), once that area has registered it. */
  tripSetup: (tripId: string): Href | undefined => hrefFor('3c-3', { tripId }),
};

let registered = false;

/** Joins the vote screens to the registry (once). */
export function registerVoteScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens({
    '3b-3': (params) => voteRoutes.pitch(params['crewId'] ?? '', params['placeId']),
    '3b-7': (params) => voteRoutes.search(params['crewId']),
    '3b-8': (params) => voteRoutes.place(params['placeId'] ?? ''),
    '3c-1': (params) => voteRoutes.showdown(params['pollId'] ?? ''),
    '3c-2': (params) => voteRoutes.reveal(params['pollId'] ?? ''),
  });
}
