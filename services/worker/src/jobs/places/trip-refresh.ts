/**
 * `places.trip_refresh`: brings one trip's `trip_places` cards in line with the places it uses
 * (`app.refresh_trip_places`, packages/db/migrations/*_trip_places.sql), so the trip stream carries
 * them to members' phones. Queued by `tripPlacesEventHook` for the events this process appends (the
 * api registers the same hand-off for its own events); one run per trip at a time.
 */
import { onEventAppended, sendInTx, withSystem } from '@cp/db';
import {
  TRIP_PLACES_REFRESH_QUEUE,
  tripPlacesRefreshFor,
  tripPlacesRefreshJobSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss';

/** Queues the trip's refresh in the transaction that appended an event changing its places. */
export async function tripPlacesEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const send = tripPlacesRefreshFor(event);
  if (send !== null) await sendInTx(tx, send.queue, send.data, send.options);
}

let hooked = false;

export function tripPlacesRefreshJob(): AnyJobDefinition {
  if (!hooked) {
    hooked = true;
    onEventAppended(tripPlacesEventHook);
  }
  return defineJob({
    queue: TRIP_PLACES_REFRESH_QUEUE,
    schema: tripPlacesRefreshJobSchema,
    singletonKey: (data) => data.trip_id,
    async handler(data, { pool }) {
      const changed = await withSystem(pool, async (tx) => {
        const { rows } = await tx.query<{ changed: number }>(
          'SELECT app.refresh_trip_places($1) AS changed',
          [data.trip_id],
        );
        return rows[0]?.changed ?? 0;
      });
      return { changed };
    },
  });
}
