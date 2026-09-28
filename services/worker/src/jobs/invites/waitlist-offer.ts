/**
 * `waitlist.offer` (every minute, and on demand for one trip): every live trip with people waiting
 * and a free seat (someone RSVP'd out, left the crew or a boost raised the cap) offers each free
 * seat to the next person in line for 24 hours, announced as `trip.seat_opened` (the seat-opened
 * push). Offers are never joins: the member accepts or the offer lapses (./offer-expire.ts).
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { SEAT_OFFER_WINDOW_HOURS } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

interface OfferRow {
  readonly offer_id: string;
  readonly offered_user: string;
  readonly offer_expires_at: Date;
}

/** Offers one trip's free seats; returns the offers made. */
export async function offerFreedSeats(pool: pg.Pool, tripId: string): Promise<readonly OfferRow[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<OfferRow>(
      'SELECT * FROM app.offer_freed_seats($1, make_interval(hours => $2))',
      [tripId, SEAT_OFFER_WINDOW_HOURS],
    );
    const crew = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
      tripId,
    ]);
    for (const row of rows) {
      await appendDomainEvent(tx, {
        type: 'trip.seat_opened',
        aggregateKind: 'seat_offer',
        aggregateId: row.offer_id,
        actorKind: 'system',
        actorId: null,
        payload: {
          trip_id: tripId,
          offer_id: row.offer_id,
          user_id: row.offered_user,
          expires_at: row.offer_expires_at.toISOString(),
        },
        crewId: crew.rows[0]?.crew_id ?? null,
        tripId,
      });
    }
    return rows;
  });
}

/** Live trips where someone is waiting. */
export async function tripsWithWaiters(pool: pg.Pool): Promise<readonly string[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ trip_id: string }>(
      `SELECT DISTINCT tp.trip_id FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
        WHERE tp.rsvp = 'waitlisted' AND t.status NOT IN ('cancelled', 'archived', 'post_trip')`,
    );
    return rows.map((row) => row.trip_id);
  });
}

export function waitlistOfferJob(): AnyJobDefinition {
  return defineJob({
    queue: 'waitlist.offer',
    schema: z.object({ trip_id: z.uuid().optional() }).nullish(),
    async handler(data, { pool, job }) {
      const trips = data?.trip_id === undefined ? await tripsWithWaiters(pool) : [data.trip_id];
      let offers = 0;
      for (const tripId of trips) {
        if (job.signal.aborted) break;
        offers += (await offerFreedSeats(pool, tripId)).length;
      }
      return { trips: trips.length, offers };
    },
  });
}
