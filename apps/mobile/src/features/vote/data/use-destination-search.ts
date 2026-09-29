/**
 * Place search (`GET /v1/places?q=`) as the user types: debounced, the latest answer wins, and an
 * unreachable api reads as `offline` so the sheet can say so instead of showing nothing.
 */
import { useEffect, useState } from 'react';

import { useVoteServices } from './vote-services';

export const SEARCH_DEBOUNCE_MS = 180;

export interface PlaceResult {
  readonly place_id: string;
  readonly name: string;
  readonly country: string | null;
  readonly country_code: string | null;
  readonly coverage: 'live' | 'guest';
  readonly guide: string;
  readonly locals: readonly string[];
}

export interface PlaceSearchState {
  readonly status: 'idle' | 'loading' | 'ready' | 'offline';
  readonly query: string;
  readonly results: readonly PlaceResult[];
}

export function useDestinationSearch(query: string): PlaceSearchState {
  const services = useVoteServices();
  const [answer, setAnswer] = useState<PlaceSearchState>({
    status: 'idle',
    query: '',
    results: [],
  });
  const q = query.trim();
  useEffect(() => {
    if (q.length === 0) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      services.searchPlaces(q, controller.signal).then(
        (results) => setAnswer({ status: 'ready', query: q, results }),
        () => {
          if (!controller.signal.aborted) setAnswer({ status: 'offline', query: q, results: [] });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, services]);
  if (q.length === 0) return { status: 'idle', query: '', results: [] };
  // Until this query answers, the last answer stays on screen while it loads.
  return answer.query === q ? answer : { ...answer, status: 'loading', query: q };
}
