/**
 * The links of a trip's stops, read through the api once per stop and kept for offline. Answers
 * what it has: a stop whose read is missing simply offers no day trips.
 */
import { useEffect, useMemo, useState } from 'react';

import { lastGoodCache, readThrough, useTravelDataReader } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';

import { destinationLinksPath, destinationLinksSchema, linksOf, type AreaLink } from './area-links';

const NONE: readonly AreaLink[] = [];

export function useAreaLinks(destinationIds: readonly string[]): {
  readonly links: readonly AreaLink[];
  readonly loaded: boolean;
} {
  const reader = useTravelDataReader();
  const key = [...new Set(destinationIds)].sort().join(',');
  const [answer, setAnswer] = useState<{ key: string; links: readonly AreaLink[] } | null>(null);
  useEffect(() => {
    if (key === '') return undefined;
    const controller = new AbortController();
    void Promise.all(
      key.split(',').map(async (id) => {
        const path = destinationLinksPath(id);
        if (path === null) return [];
        const state = await readThrough({
          reader,
          cache: lastGoodCache(),
          path,
          schema: destinationLinksSchema,
          classify: () => ({ status: 'ok', seenAt: null }),
          signal: controller.signal,
        });
        const data = dataOf(state);
        return data === undefined ? [] : linksOf(data);
      }),
    ).then((all) => {
      if (!controller.signal.aborted) setAnswer({ key, links: all.flat() });
    });
    return () => controller.abort();
  }, [key, reader]);
  return useMemo(
    () =>
      key === ''
        ? { links: NONE, loaded: true }
        : answer?.key === key
          ? { links: answer.links, loaded: true }
          : { links: NONE, loaded: false },
    [answer, key],
  );
}
