/**
 * The vote area's network calls behind one seam: the pitch stream, place search and the guest
 * brief. The vote and places routes provide the device services (./device-vote-services.ts);
 * tests provide services that replay recorded answers.
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { SseFrame } from './sse-client';
import type { PlaceResult } from './use-destination-search';

export interface VoteServices {
  readonly streamPitch: (
    body: { crew_id: string; place_id: string; month?: number },
    onFrame: (frame: SseFrame) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly searchPlaces: (q: string, signal: AbortSignal) => Promise<PlaceResult[]>;
  readonly streamGuestBrief: (
    placeId: string,
    body: { crew_id?: string },
    onFrame: (frame: SseFrame) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

/** Before a route layout provides the device services, every call reads as offline. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error, never shown.
const NO_SERVICES = 'no vote services';
const offline = (): Promise<never> => Promise.reject(new Error(NO_SERVICES));
const unavailable: VoteServices = {
  streamPitch: offline,
  searchPlaces: offline,
  streamGuestBrief: offline,
};

const VoteServicesContext = createContext<VoteServices>(unavailable);

export function VoteServicesProvider({
  services,
  children,
}: {
  readonly services: VoteServices;
  readonly children: ReactNode;
}) {
  return <VoteServicesContext.Provider value={services}>{children}</VoteServicesContext.Provider>;
}

export function useVoteServices(): VoteServices {
  return useContext(VoteServicesContext);
}
