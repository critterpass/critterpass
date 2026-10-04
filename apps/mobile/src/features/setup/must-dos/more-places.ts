/**
 * "More places" under the add sheet's own results, on the shared live search (data/places): asked
 * when the guide finds fewer than five places online; nothing Foursquare returns is kept.
 */
import type { SetupServices } from '../data/services';
import type { SearchState } from './search';
import {
  resolveLivePlace,
  useLivePlaces,
  wantsLivePlaces,
  type LivePick,
  type LivePlace,
  type MorePlacesState,
} from '@/data/places/more-places';

export { MORE_PLACES_DEBOUNCE_MS } from '@/data/places/more-places';
export type { LivePick, LivePlace, MorePlacesState } from '@/data/places/more-places';

/** Whether our own results leave room for a live search. */
export function wantsMorePlaces(query: string, search: SearchState): boolean {
  return search.kind === 'done' && wantsLivePlaces(query, search.results.length, search.offline);
}

export function useMorePlaces(options: {
  readonly services: SetupServices;
  readonly destinationId: string | null;
  readonly query: string;
  readonly search: SearchState;
}): MorePlacesState {
  return useLivePlaces({
    getJson: options.services.getJson,
    destinationId: options.destinationId,
    query: options.query,
    wanted: wantsMorePlaces(options.query.trim(), options.search),
  });
}

/** Asks the api for the storable place behind a live result. */
export function resolveLivePick(
  services: SetupServices,
  destinationId: string,
  place: LivePlace,
): Promise<LivePick> {
  return resolveLivePlace(services.getJson, destinationId, place);
}
