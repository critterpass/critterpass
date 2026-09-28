/**
 * What the invited fast path talks to beyond the command queue: the link preview (the ticket and
 * the code card read it) and the clock the "opened … ago" line and the join timing use. Screens
 * read it from context, so tests swap in a double at the api boundary only.
 */
import type { LinkTarget } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

import type { PreviewResult } from '@/lib/links/resolver-client';

export interface InviteServices {
  /** `GET /v1/links/{code}/preview`; never throws (offline answers `unavailable`). */
  readonly preview: (target: LinkTarget) => Promise<PreviewResult>;
  /** The signed-in uid (the manifest marks the newcomer's own card). */
  readonly uid: () => Promise<string>;
  readonly now: () => number;
}

const InviteServicesContext = createContext<InviteServices | null>(null);

export function InviteServicesProvider({
  services,
  children,
}: {
  readonly services: InviteServices;
  readonly children: ReactNode;
}) {
  return (
    <InviteServicesContext.Provider value={services}>{children}</InviteServicesContext.Provider>
  );
}

export function useInviteServices(): InviteServices {
  const services = useContext(InviteServicesContext);
  if (services === null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
    throw new Error('useInviteServices needs an InviteServicesProvider above it');
  }
  return services;
}
