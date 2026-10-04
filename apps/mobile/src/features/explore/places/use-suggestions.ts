/**
 * Tokek's suggestions for the list (7c-3 "TOKEK SUGGESTS · 64"), ranked by fit on the server
 * (`GET /v1/trips/{id}/places/suggest`): the first page on open, the next as the list nears its
 * end. Offline, or before the answer lands, the list ranks the phone's curated places itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and header values, never copy. */
import { placeFitSchema, type PlaceFit } from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

const TIMEOUT_MS = 10_000;
export const SUGGEST_PAGE = 30;

export interface SuggestPage {
  readonly places: readonly { readonly poi_id: string; readonly fit: PlaceFit }[];
  readonly next_cursor: string | null;
  readonly total: number;
}

/** The page as the app reads it; a fit it can't read (a newer reason) leaves out that place only. */
export function readSuggestPage(body: unknown): SuggestPage | null {
  const page = body as { places?: unknown; next_cursor?: unknown; total?: unknown } | null;
  if (page === null || !Array.isArray(page.places) || typeof page.total !== 'number') return null;
  const places = page.places.flatMap((entry: unknown) => {
    const row = entry as { poi_id?: unknown; fit?: unknown } | null;
    const fit = placeFitSchema.safeParse(row?.fit);
    return typeof row?.poi_id === 'string' && fit.success
      ? [{ poi_id: row.poi_id, fit: fit.data }]
      : [];
  });
  const cursor = typeof page.next_cursor === 'string' ? page.next_cursor : null;
  return { places, next_cursor: cursor, total: page.total };
}

export interface Suggestions {
  /** Ranked place ids, every page asked so far. */
  readonly order: readonly string[];
  readonly fits: ReadonlyMap<string, PlaceFit>;
  /** Every suggestion left, all pages together; null until the first page lands. */
  readonly total: number | null;
  readonly loadMore: () => void;
}

async function askPage(tripId: string, cursor: string, categories: readonly string[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const query = new URLSearchParams({ limit: String(SUGGEST_PAGE), cursor });
    if (categories.length > 0) query.set('category', categories.join(','));
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/places/suggest?${query.toString()}`,
      { headers: await sessionHeaders(), signal: controller.signal },
    );
    if (!response.ok) return null;
    return readSuggestPage(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** `versionId` is the plan version: a new one asks again from the first page. */
export function useSuggestions(
  tripId: string | null,
  versionId: string | null,
  categories: readonly string[] = [],
): Suggestions {
  const key = `${tripId ?? ''}|${versionId ?? ''}|${categories.join(',')}`;
  const [state, setState] = useState<{
    key: string;
    pages: readonly SuggestPage[];
  }>({ key: '', pages: [] });
  const asking = useRef(false);

  // The first page for this trip, plan version and filter.
  useEffect(() => {
    if (tripId === null) return undefined;
    let live = true;
    void (async () => {
      const page = await askPage(tripId, '0', categories);
      if (live && page !== null) setState({ key, pages: [page] });
    })();
    return () => {
      live = false;
    };
    // `key` folds in the trip, the version and the categories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pages = useMemo(() => (state.key === key ? state.pages : []), [state, key]);
  const last = pages.at(-1);
  const loadMore = useCallback(() => {
    const cursor = last?.next_cursor;
    if (tripId === null || cursor === null || cursor === undefined || asking.current) return;
    asking.current = true;
    void askPage(tripId, cursor, categories).then((page) => {
      asking.current = false;
      if (page === null) return;
      setState((now) => (now.key === key ? { key, pages: [...now.pages, page] } : now));
    });
    // `key` folds in the trip, the version and the categories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, last]);

  return useMemo(
    () => ({
      order: pages.flatMap((page) => page.places.map((entry) => entry.poi_id)),
      fits: new Map(
        pages.flatMap((page) => page.places.map((entry) => [entry.poi_id, entry.fit] as const)),
      ),
      total: pages[0]?.total ?? null,
      loadMore,
    }),
    [pages, loadMore],
  );
}
