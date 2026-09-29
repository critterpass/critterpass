/**
 * The drafting area's routes and the design screen ids the navigation registry knows them by:
 * drafting (3c-8), the private draft (3c-9), change a day (3c-11), the redraft diff (3c-12) and
 * the last-free-redraft interstitial (4f-3). Pushes link the draft as `/trip/{id}/draft`, which
 * `app/(trip)/trip/[tripId]/draft.tsx` forwards here. A day opens in the plan area's day screen
 * in draft mode (3e-2) once that area has registered it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { RedraftReason } from '@cp/domain';
import type { Href } from 'expo-router';

import { hrefFor, registerScreens } from '@/lib/navigation/screen-registry';

/** A redraft asked for on the change-a-day sheet, carried to the last-redraft interstitial. */
export interface RedraftAsk {
  readonly day: number;
  readonly reasons: readonly RedraftReason[];
  readonly note: string;
  readonly free: boolean;
}

export const draftRoutes = {
  review: (tripId: string): Href => ({ pathname: '/[tripId]/draft', params: { tripId } }),
  drafting: (tripId: string): Href => ({
    pathname: '/[tripId]/draft/drafting',
    params: { tripId },
  }),
  /** `free`: the sheet asks for the free fit-in redraft a must-do added after the draft gets. */
  changeDay: (tripId: string, day?: number, free = false): Href => ({
    pathname: '/[tripId]/draft/change-day',
    params: {
      tripId,
      ...(day === undefined ? {} : { day: String(day) }),
      ...(free ? { free: '1' } : {}),
    },
  }),
  lastRedraft: (tripId: string, ask: RedraftAsk): Href => ({
    pathname: '/[tripId]/draft/last-redraft',
    params: {
      tripId,
      day: String(ask.day),
      reasons: ask.reasons.join(','),
      note: ask.note,
      ...(ask.free ? { free: '1' } : {}),
    },
  }),
  /** `day`: the day asked for, shown while the redraft is still thinking. */
  redraft: (tripId: string, redraftId: string, day?: number): Href => ({
    pathname: '/[tripId]/draft/redraft/[redraftId]',
    params: day === undefined ? { tripId, redraftId } : { tripId, redraftId, day: String(day) },
  }),
  /** A draft day in the plan area's day screen (draft mode), once registered. */
  day: (tripId: string, day: number): Href | undefined =>
    hrefFor('3e-2', { tripId, day: String(day), version: 'draft' }),
  /** Trip setup's last step (another area's 3c-7), once registered. */
  setup: (tripId: string): Href | undefined => hrefFor('3c-7', { tripId }),
};

let registered = false;

/** Joins the drafting screens to the registry (once). */
export function registerDraftScreens(): void {
  if (registered) return;
  registered = true;
  const trip = (params: Readonly<Record<string, string>>) => params['tripId'] ?? '';
  registerScreens({
    '3c-8': (params) => draftRoutes.drafting(trip(params)),
    '3c-9': (params) => draftRoutes.review(trip(params)),
    '3c-11': (params) => draftRoutes.changeDay(trip(params)),
    '3c-12': (params) => draftRoutes.redraft(trip(params), params['redraftId'] ?? ''),
  });
}
