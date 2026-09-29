/**
 * The pre-draft closure check wired to the process's search provider (Tavily) and gateway: the
 * trip's destination, dates and its first places go out as queries (crew names cut), and what
 * comes back is closure records with their source pages, or nothing when search is not
 * configured or fails.
 */
import { checkClosures, type Gateway, type SearchProvider, type UsageContext } from '@cp/ai';
import type { ClosureRecord } from '@cp/domain';

import type { ClosureCheck } from './prefetch';

/** Places the check names (must-dos first, then the best of the pools). */
export const CLOSURE_PLACES = 20;

export function webClosureCheck(deps: {
  readonly search: SearchProvider;
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly usage?: UsageContext;
}): ClosureCheck {
  return async (trip, places): Promise<ClosureRecord[]> =>
    checkClosures(
      {
        search: deps.search,
        gateway: deps.gateway,
        ...(deps.usage === undefined ? {} : { usage: deps.usage }),
      },
      {
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        places: places.slice(0, CLOSURE_PLACES).map((place, index) => ({
          id: place.id,
          handle: `p${index + 1}`,
          name: place.name,
        })),
        privateTerms: trip.members.map((member) => member.name),
      },
    );
}
