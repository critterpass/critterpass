/**
 * What the setup screens need from outside the local database: online-only reads from the api
 * (window options for another trip length, the anonymous budget band, the caller's own fit and
 * private values), opening a URL (calendar OAuth) and the clock. `./device-services.ts` wires the
 * real api; tests and the developer scenes pass doubles at this boundary only.
 */
import { createContext, useContext, type ReactNode } from 'react';

/** An api read: the parsed body, a wire error code, or no answer at all (offline, timeout). */
export type ApiRead =
  | { readonly kind: 'ok'; readonly body: unknown }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly code: string;
      /** The error envelope's `detail`, when the server sent one. */
      readonly detail?: unknown;
    }
  | { readonly kind: 'offline' };

export interface SetupServices {
  /** `GET` an api path (`/v1/...`) with the session attached. */
  readonly getJson: (path: string) => Promise<ApiRead>;
  /** Opens a URL outside the app (the system browser for calendar OAuth). */
  readonly openUrl: (url: string) => Promise<void>;
  /** The api's absolute URL for a path (the OAuth start is opened in the browser). */
  readonly apiUrl: (path: string) => string;
  readonly now: () => number;
}

/** A read's body when it parsed with `parse`, else null. */
export function bodyOf<T>(read: ApiRead, parse: (body: unknown) => T | null): T | null {
  return read.kind === 'ok' ? parse(read.body) : null;
}

const SetupServicesContext = createContext<SetupServices | null>(null);

export function SetupServicesProvider({
  services,
  children,
}: {
  readonly services: SetupServices;
  readonly children: ReactNode;
}) {
  return <SetupServicesContext.Provider value={services}>{children}</SetupServicesContext.Provider>;
}

export function useSetupServices(): SetupServices {
  const services = useContext(SetupServicesContext);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
  if (services === null) throw new Error('useSetupServices outside SetupServicesProvider');
  return services;
}
