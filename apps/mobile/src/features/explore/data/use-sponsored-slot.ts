/**
 * The sponsored slot for a list the app builds itself (`/v1/explore/sponsored`): the map's
 * carousel and search results. Null for Pass+, boosted trips and while sponsored picks are off.
 * Never stored: it is asked for each time the list is shown.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { sponsoredSlotResponseSchema, type SponsoredSlotResponse } from '@cp/domain';

import type { LastGoodCache } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';
import { query, useTravelRead } from '@/data/travel-data/use-travel-read';

import type { ListKind } from '../sponsored-model';

const nowhere: LastGoodCache = { get: () => undefined, set: () => undefined };

export function useSponsoredSlot(input: {
  readonly destinationId: string | null;
  readonly list: ListKind;
  readonly tripId: string | null;
}): SponsoredSlotResponse['slot'] {
  const state = useTravelRead({
    path:
      input.destinationId === null
        ? null
        : `/v1/explore/sponsored${query({
            destination_id: input.destinationId,
            list_kind: input.list,
            trip_id: input.tripId ?? undefined,
          })}`,
    schema: sponsoredSlotResponseSchema,
    classify: () => ({ status: 'ok', seenAt: null }),
    cache: nowhere,
  });
  return dataOf(state)?.slot ?? null;
}
