/**
 * When places fit the trip's days, from the server's fit engine (`POST /v1/trips/{id}/fit`,
 * docs/api-contracts-planning.md): up to 50 places a call, asked again when the plan's version
 * changes. Answers are private and never stored on disk; the last good answer per place stays in
 * memory, so a list keeps its fit lines while offline or between versions.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and header values, never copy. */
import { placeFitSchema, type PlaceFit } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

/** The route's own cap on places per call. */
export const FIT_BATCH = 50;
const TIMEOUT_MS = 10_000;

/** The answer's fits; a fit the app can't read (a newer reason) is left out, not the whole answer. */
export function readFits(body: unknown): PlaceFit[] | null {
  const fits = (body as { fits?: unknown } | null)?.fits;
  if (!Array.isArray(fits)) return null;
  return fits.flatMap((fit) => {
    const parsed = placeFitSchema.safeParse(fit);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The last good fit per trip and place, for this run of the app only. */
const lastGood = new Map<string, PlaceFit>();
const keyOf = (tripId: string, poiId: string) => `${tripId}:${poiId}`;

export type FitStatus = 'idle' | 'loading' | 'ready' | 'stale';

export interface FitRead {
  readonly fits: ReadonlyMap<string, PlaceFit>;
  /** `stale`: the last ask failed (offline, an error), and what shows is the last good answer. */
  readonly status: FitStatus;
}

/** Places in batches the route takes, each place once. */
export function fitBatches(poiIds: readonly string[]): string[][] {
  const unique = [...new Set(poiIds)];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += FIT_BATCH) {
    batches.push(unique.slice(index, index + FIT_BATCH));
  }
  return batches;
}

async function askFit(tripId: string, poiIds: readonly string[], signal: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  try {
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/fit`,
      {
        method: 'POST',
        headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
        body: JSON.stringify({ poi_ids: poiIds }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    return readFits(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

/**
 * The fit of each place in `poiIds` for the trip. `versionId` is the plan version the fits answer
 * for: a new one asks again.
 */
export function useFit(
  tripId: string | null,
  poiIds: readonly string[],
  versionId: string | null = null,
): FitRead {
  const ids = useMemo(() => [...new Set(poiIds)].sort(), [poiIds]);
  const idsKey = ids.join(',');
  const [state, setState] = useState<{ key: string; status: FitStatus; at: number }>({
    key: '',
    status: 'idle',
    at: 0,
  });
  const askKey = `${tripId ?? ''}|${versionId ?? ''}|${idsKey}`;

  useEffect(() => {
    if (tripId === null || ids.length === 0) return undefined;
    const controller = new AbortController();
    void (async () => {
      let failed = false;
      for (const batch of fitBatches(ids)) {
        const fits = await askFit(tripId, batch, controller.signal);
        if (controller.signal.aborted) return;
        if (fits === null) {
          failed = true;
          continue;
        }
        for (const fit of fits) {
          if (fit.poi_id !== null) lastGood.set(keyOf(tripId, fit.poi_id), fit);
        }
      }
      setState({ key: askKey, status: failed ? 'stale' : 'ready', at: Date.now() });
    })();
    return () => controller.abort();
    // `askKey` folds in the trip, the version and the ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);

  return useMemo(() => {
    const fits = new Map<string, PlaceFit>();
    if (tripId !== null) {
      for (const id of ids) {
        const fit = lastGood.get(keyOf(tripId, id));
        if (fit !== undefined) fits.set(id, fit);
      }
    }
    const status: FitStatus =
      tripId === null || ids.length === 0
        ? 'idle'
        : state.key === askKey
          ? state.status
          : 'loading';
    return { fits, status };
    // `state.at` re-reads the in-memory answers after each ask lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey, state.at, state.key, state.status]);
}
