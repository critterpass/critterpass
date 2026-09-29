/**
 * What the crew live map needs from outside the screen: the live snapshot over HTTP, the device's
 * own fixes from the location engine, and the clock. `./device-services.ts` wires the real api and
 * engine; tests pass doubles at these boundaries only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: a route path and wire codes. */
import { liveSnapshotSchema, type LiveSnapshot } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

export type SnapshotResult =
  | { readonly kind: 'ok'; readonly snapshot: LiveSnapshot }
  /** `ENTITLEMENT_REQUIRED` (not boosted) or `NOT_ELIGIBLE` (off the trip, outside trip days). */
  | { readonly kind: 'closed'; readonly code: string; readonly reason: string | null }
  /** No answer (offline, timeout, 5xx): keep what is on screen. */
  | { readonly kind: 'unavailable' };

export interface OwnFix {
  readonly lat: number;
  readonly lng: number;
  readonly acc: number;
  readonly at: number;
}

export interface LiveMapServices {
  readonly loadSnapshot: (tripId: string) => Promise<SnapshotResult>;
  /** The device's latest fix, and a listener for the next ones; the returned function stops it. */
  readonly watchOwnFix: (listener: (fix: OwnFix) => void) => () => void;
  /** Low Power Mode / Battery Saver: the engine drops to coarse fixes ("Saving battery"). */
  readonly isLowPowerMode: () => boolean;
  readonly now: () => number;
}

export function parseSnapshotResponse(status: number, body: unknown): SnapshotResult {
  if (status === 200) {
    const parsed = liveSnapshotSchema.safeParse(body);
    return parsed.success ? { kind: 'ok', snapshot: parsed.data } : { kind: 'unavailable' };
  }
  const error = (body as { error?: { code?: unknown; detail?: { reason?: unknown } } } | null)
    ?.error;
  if ((status === 402 || status === 403) && typeof error?.code === 'string') {
    const reason = error.detail?.reason;
    return { kind: 'closed', code: error.code, reason: typeof reason === 'string' ? reason : null };
  }
  return { kind: 'unavailable' };
}

const LiveMapServicesContext = createContext<LiveMapServices | null>(null);

export function LiveMapServicesProvider({
  services,
  children,
}: {
  readonly services: LiveMapServices;
  readonly children: ReactNode;
}) {
  return (
    <LiveMapServicesContext.Provider value={services}>{children}</LiveMapServicesContext.Provider>
  );
}

export function useLiveMapServices(): LiveMapServices {
  const services = useContext(LiveMapServicesContext);
  if (services === null) throw new Error('useLiveMapServices outside LiveMapServicesProvider');
  return services;
}
