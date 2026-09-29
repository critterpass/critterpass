/**
 * The crew live map's device services: the live snapshot from the api with the session attached,
 * the location engine's own fixes, and the wall clock. Imported by the route only, so screens and
 * tests never load the device session.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: a route path and headers. */
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { getLocationEngine } from '@/lib/location';

import { parseSnapshotResponse, type LiveMapServices } from './services';

const SNAPSHOT_TIMEOUT_MS = 10_000;

/** The real api and engine; the route passes the native Low Power Mode reader. */
export function deviceLiveMapServices(options: {
  readonly isLowPowerMode: () => boolean;
}): LiveMapServices {
  return {
    async loadSnapshot(tripId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
      try {
        const response = await fetch(`${resolveApiBaseUrl()}/v1/trips/${tripId}/live-snapshot`, {
          headers: { accept: 'application/json', ...(await sessionHeaders()) },
          signal: controller.signal,
        });
        const text = await response.text();
        return parseSnapshotResponse(response.status, text.length > 0 ? JSON.parse(text) : null);
      } catch {
        return { kind: 'unavailable' };
      } finally {
        clearTimeout(timer);
      }
    },
    watchOwnFix(listener) {
      const engine = getLocationEngine();
      if (engine === null) return () => undefined;
      const latest = engine.recentFixes().at(-1);
      if (latest !== undefined) listener(latest);
      return engine.subscribe('share', { onFix: (fix) => listener(fix) });
    },
    isLowPowerMode: options.isLowPowerMode,
    now: () => Date.now(),
  };
}
