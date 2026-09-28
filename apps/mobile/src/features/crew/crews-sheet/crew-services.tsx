/**
 * What the crew screens need beyond the database and the command queue: the signed-in uid, the
 * system share sheet (a native boundary) and the guide's tag suggestions from the api. Tests swap
 * in a double here only.
 */
import type { InviteTagsRequest, InviteTagsResponse } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

export interface CrewServices {
  readonly uid: () => Promise<string>;
  /** Opens the system share sheet with `message`; resolves once it closes. */
  readonly share: (message: string) => Promise<void>;
  /** Copies `text` to the clipboard. */
  readonly copy: (text: string) => Promise<void>;
  /** Opens a messaging app's compose URL (WhatsApp, Messages); false when it cannot open. */
  readonly openUrl: (url: string) => Promise<boolean>;
  /** The public link for an invite code (and seat), on this build's link host. */
  readonly inviteUrl: (code: string, seat?: string) => string;
  /** The public referral link (`/r/{code}`) on this build's link host. */
  readonly referralUrl: (code: string) => string;
  /** `POST /v1/invites/tags`: the guide's tags and line for a note; null when unreachable. */
  readonly inviteTags: (request: InviteTagsRequest) => Promise<InviteTagsResponse | null>;
}

const CrewServicesContext = createContext<CrewServices | null>(null);

export function CrewServicesProvider({
  services,
  children,
}: {
  readonly services: CrewServices;
  readonly children: ReactNode;
}) {
  return <CrewServicesContext.Provider value={services}>{children}</CrewServicesContext.Provider>;
}

export function useCrewServices(): CrewServices {
  const services = useContext(CrewServicesContext);
  if (services === null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
    throw new Error('useCrewServices needs a CrewServicesProvider above it');
  }
  return services;
}
