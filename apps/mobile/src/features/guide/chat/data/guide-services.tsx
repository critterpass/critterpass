/**
 * The guide area's network calls behind one seam: the sheet's turn stream and the crew mention
 * stream. The guide routes provide the device services (./guide-stream.ts); tests and the (dev)
 * lab provide services that replay recorded frames.
 */
import type { GuideTurnBody } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

import { GuideStreamError, type GuideFrame } from './guide-frames';

/** The turn body as the app sends it; the server fills the defaults. */
export type GuideTurnRequest = Pick<GuideTurnBody, 'text' | 'thread_mode'> & {
  readonly context: { readonly trip_id?: string | null; readonly screen?: string };
};

export interface GuideServices {
  readonly streamTurn: (
    threadId: string,
    body: GuideTurnRequest,
    onFrame: (frame: GuideFrame) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly streamMention: (
    crewId: string,
    messageId: string,
    onFrame: (frame: GuideFrame) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

/** Before a route provides the device services, every stream fails as a dropped connection. */
const unavailable: GuideServices = {
  streamTurn: () => Promise.reject(new GuideStreamError(null)),
  streamMention: () => Promise.reject(new GuideStreamError(null)),
};

const GuideServicesContext = createContext<GuideServices>(unavailable);

export function GuideServicesProvider({
  services,
  children,
}: {
  readonly services: GuideServices;
  readonly children: ReactNode;
}) {
  return <GuideServicesContext.Provider value={services}>{children}</GuideServicesContext.Provider>;
}

export function useGuideServices(): GuideServices {
  return useContext(GuideServicesContext);
}
