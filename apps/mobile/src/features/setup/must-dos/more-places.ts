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
import { t } from '@lingui/core/macro';

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

/** What became of the last pick: still asking, or why it cannot be added. */
export interface LivePickNote {
  readonly fsqPlaceId: string;
  readonly kind: 'resolving' | 'loading' | 'unavailable' | 'offline';
}

export function noteText(kind: LivePickNote['kind'], place: string): string {
  switch (kind) {
    case 'resolving':
      return t({ id: 'setup.addMustDo.more.resolving', message: 'Getting this place ready…' });
    case 'loading':
      return t({
        id: 'setup.addMustDo.more.loading',
        message: `We’re still gathering places in ${place}. Try this one again in a few minutes.`,
      });
    case 'offline':
      return t({
        id: 'setup.addMustDo.more.offline',
        message: 'No signal. Try again when you’re back online.',
      });
    case 'unavailable':
      return t({
        id: 'setup.addMustDo.more.unavailable',
        message:
          'This place can’t be saved: CritterPass keeps only places from open map data. Keep it in your own words instead.',
      });
  }
}

export interface MorePlacesProps {
  readonly state: MorePlacesState;
  readonly note: LivePickNote | null;
  readonly destinationName: string;
  readonly onPick: (place: LivePlace) => void;
}
