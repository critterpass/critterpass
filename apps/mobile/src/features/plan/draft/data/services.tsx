/**
 * What the drafting screens need from outside the local database: the `GET /v1/jobs/{id}` poll
 * fallback and the clock. `./device-services.ts` wires the real api; the developer scenes pass a
 * fixed clock and no network at this boundary only.
 */
import { createContext, useContext, type ReactNode } from 'react';

/** An api read: the parsed body, a wire error code, or no answer at all (offline, timeout). */
export type ApiRead =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'error'; readonly status: number; readonly code: string }
  | { readonly kind: 'offline' };

export interface DraftServices {
  /** `GET` an api path (`/v1/...`) with the session attached. */
  readonly getJson: (path: string) => Promise<ApiRead>;
  readonly now: () => number;
}

const DraftServicesContext = createContext<DraftServices | null>(null);

export function DraftServicesProvider({
  services,
  children,
}: {
  readonly services: DraftServices;
  readonly children: ReactNode;
}) {
  return <DraftServicesContext.Provider value={services}>{children}</DraftServicesContext.Provider>;
}

export function useDraftServices(): DraftServices {
  const services = useContext(DraftServicesContext);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
  if (services === null) throw new Error('useDraftServices outside DraftServicesProvider');
  return services;
}
