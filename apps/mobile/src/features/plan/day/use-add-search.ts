/**
 * The add sheet's search: the phone's curated places first, the server's open-data places after
 * them (never twice), and what to say when there are no rows yet. Offline it is the phone alone.
 */
import { usePlaceSearch } from './place-search';
import type { PlaceRow } from './queries';
import {
  mergePlaceRows,
  searchState,
  useServerPlaceSearch,
  type SearchState,
} from './server-place-search';

export interface AddSheetSearch {
  readonly rows: readonly PlaceRow[];
  readonly loaded: true;
  readonly state: SearchState;
  readonly more: boolean;
  readonly retry: () => void;
}

export function useAddSheetSearch(
  destinationId: string | null,
  tripId: string | null,
  query: string,
): AddSheetSearch {
  const local = usePlaceSearch(destinationId, query, undefined, tripId);
  const server = useServerPlaceSearch(destinationId, query);
  const rows = mergePlaceRows(local.rows, server.rows);
  const { state, more } = searchState({
    rows: rows.length,
    local: { loaded: local.loaded, failed: local.failed, arriving: local.arriving },
    server: server.status,
  });
  return {
    rows,
    loaded: true,
    state,
    more,
    retry: () => {
      local.retry();
      server.retry();
    },
  };
}
