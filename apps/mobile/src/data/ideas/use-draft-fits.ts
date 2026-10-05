/**
 * Where each saved place would fit the organiser's own draft, asked of the fit route when her
 * Ideas open. The plan check stores a fit on an idea only for the crew's plan (ideas sync to
 * everyone, and a fit worked out on a private draft would tell a member it exists), so before the
 * crew has a plan her fits are read live, and are simply absent without signal.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import type { StoredFit } from '@cp/domain';
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { readDraftFits } from './draft-fits';

const TIMEOUT_MS = 10_000;
/** The fit route answers up to this many places at once. */
const MAX_PLACES = 50;

const NONE: ReadonlyMap<string, StoredFit> = new Map();

/** `draftVersionId` null (the crew has a plan, or this is not her draft): nothing is asked. */
export function useDraftFits(
  tripId: string,
  poiIds: readonly string[],
  draftVersionId: string | null,
): ReadonlyMap<string, StoredFit> {
  const ids = [...new Set(poiIds)].sort().slice(0, MAX_PLACES);
  const key =
    draftVersionId === null || ids.length === 0 ? '' : `${draftVersionId}|${ids.join(',')}`;
  const [answer, setAnswer] = useState<{ key: string; fits: ReadonlyMap<string, StoredFit> }>({
    key: '',
    fits: NONE,
  });
  useEffect(() => {
    if (key === '' || draftVersionId === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    void (async () => {
      const response = await fetch(
        `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/fit`,
        {
          method: 'POST',
          headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
          body: JSON.stringify({ poi_ids: key.split('|')[1]?.split(',') ?? [] }),
          signal: controller.signal,
        },
      );
      if (!response.ok) return;
      setAnswer({ key, fits: readDraftFits(await response.json(), draftVersionId, new Date()) });
    })()
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, tripId, draftVersionId]);
  return answer.key === key ? answer.fits : NONE;
}
