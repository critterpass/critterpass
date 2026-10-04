/**
 * Up to three ways to fill a free window (`GET /v1/trips/{id}/gaps/ideas`), asked when the window
 * changes. The card draws the window first and the ideas when they arrive; offline (or when the
 * answer fails) there are none, and the card says nothing about them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and SQL, never copy. */
import { gapIdeasResultSchema, type GapIdea } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { useLiveRows } from '../data/live-rows';

const TIMEOUT_MS = 10_000;

export interface GapWindow {
  readonly dayId: string;
  readonly from: string;
  readonly to: string;
}

export interface GapIdeaChip {
  readonly key: string;
  readonly kind: GapIdea['kind'];
  /** The places, in order (none for "back to the stay"). */
  readonly places: readonly { readonly id: string; readonly name: string }[];
}

async function askIdeas(tripId: string, window: GapWindow, signal: AbortSignal) {
  const query = new URLSearchParams({ day_id: window.dayId, start: window.from, end: window.to });
  const response = await fetch(
    `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/gaps/ideas?${query.toString()}`,
    { headers: await sessionHeaders(), signal },
  );
  if (!response.ok) return null;
  const parsed = gapIdeasResultSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.ideas : null;
}

const PLACES_SQL = `SELECT id, name FROM pois WHERE id IN (SELECT value FROM json_each(?))`;

export function useGapIdeas(
  tripId: string,
  window: GapWindow | null,
  online: boolean,
): readonly GapIdeaChip[] {
  const key = window === null ? null : `${tripId}|${window.dayId}|${window.from}|${window.to}`;
  const [answer, setAnswer] = useState<{ key: string; ideas: readonly GapIdea[] } | null>(null);
  useEffect(() => {
    if (window === null || key === null || !online) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    void askIdeas(tripId, window, controller.signal)
      .catch(() => null)
      .then((ideas) => setAnswer(ideas === null ? null : { key, ideas }))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The window is read through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online, tripId]);

  const ideas = useMemo(
    () => (answer !== null && answer.key === key && online ? answer.ideas : []),
    [answer, key, online],
  );
  const ids = useMemo(() => JSON.stringify(ideas.flatMap((idea) => idea.poi_ids)), [ideas]);
  const names = useLiveRows<{ id: string; name: string }>(
    PLACES_SQL,
    ideas.length === 0 ? null : [ids],
    ['pois'],
  ).rows;
  return useMemo(() => {
    const byId = new Map(names.map((row) => [row.id, row.name]));
    return ideas.flatMap((idea, index) => {
      const places = idea.poi_ids.flatMap((id) => {
        const name = byId.get(id);
        return name === undefined ? [] : [{ id, name }];
      });
      // A place this phone has not synced yet is left out rather than shown nameless.
      if (idea.kind !== 'stay' && places.length < idea.poi_ids.length) return [];
      return [{ key: `${String(index)}:${idea.poi_ids.join(',')}`, kind: idea.kind, places }];
    });
  }, [ideas, names]);
}
