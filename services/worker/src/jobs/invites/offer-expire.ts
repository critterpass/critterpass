/**
 * `waitlist.offer_expire` (every 5 minutes): seat offers left unanswered for their 24 hours lapse;
 * each holder goes to the back of that trip's waitlist and the seat is offered to the next person
 * straight away.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { offerFreedSeats } from './waitlist-offer';

export async function lapseSeatOffers(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ readonly lapsed: number; readonly reoffered: number }> {
  const trips = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ lapsed_trip: string }>(
      'SELECT lapsed_trip FROM app.expire_seat_offers($1)',
      [now],
    );
    return rows.map((row) => row.lapsed_trip);
  });
  let reoffered = 0;
  for (const tripId of new Set(trips)) {
    reoffered += (await offerFreedSeats(pool, tripId)).length;
  }
  return { lapsed: trips.length, reoffered };
}

export function offerExpireJob(): AnyJobDefinition {
  return defineJob({
    queue: 'waitlist.offer_expire',
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await lapseSeatOffers(pool)) };
    },
  });
}
