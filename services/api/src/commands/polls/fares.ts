/**
 * The fare a destination candidate is frozen with when it joins the vote: today's price from the
 * crew's majority home airport, pinned as a trip quote so the final's tie rule reads numbers that
 * never drift.
 */
import { majorityOriginOf, TRAVEL_DESTINATIONS } from '@cp/domain';
import type pg from 'pg';

import { readFares } from '../../travel-data/fares-read';

/** `YYYY-MM` of `month` (1–12) at or after `now`; the next month when none is given. */
export function fareMonth(now: Date, month: number | null | undefined): string {
  const current = now.getUTCMonth() + 1;
  const wanted = month ?? (current % 12) + 1;
  const year = now.getUTCFullYear() + (wanted < current ? 1 : 0);
  return `${year}-${String(wanted).padStart(2, '0')}`;
}

/**
 * Freezes today's fare to the place for the voters' majority home airport, as a trip quote.
 * `null` when the place has no fare data or no recent price (the tie rule then falls back).
 */
export async function freezeCandidateQuote(
  tx: pg.PoolClient,
  input: {
    tripId: string;
    place: { readonly id: string; readonly slug: string };
    voterIds: readonly string[];
    month: number | null;
    now: Date;
  },
): Promise<string | null> {
  const travel = TRAVEL_DESTINATIONS[input.place.slug];
  const destIata = travel?.airports[0];
  if (destIata === undefined) return null;
  const { rows } = await tx.query<{ home_airport: string | null }>(
    'SELECT home_airport FROM users WHERE id = ANY ($1::uuid[])',
    [input.voterIds],
  );
  const origin = majorityOriginOf(rows.map((row) => row.home_airport));
  if (origin === null) return null;
  const month = fareMonth(input.now, input.month);
  const [fare] = await readFares(tx, { origins: [origin.origin], destIata, month, now: input.now });
  if (fare?.state !== 'ok' || fare.price_minor === null || fare.depart_on === null) return null;
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO price_quotes (trip_id, kind, origin, destination_id, dates, amount_minor, currency,
       source, fetched_at, frozen_at)
     VALUES ($1, 'flight', $2, $3, daterange($4::date, $5::date, '[]'), $6, $7, 'travelpayouts', $8, $9)
     RETURNING id`,
    [
      input.tripId,
      origin.origin,
      input.place.id,
      fare.depart_on,
      fare.return_on ?? fare.depart_on,
      fare.price_minor,
      fare.currency,
      fare.fetched_at ?? input.now.toISOString(),
      input.now,
    ],
  );
  return inserted.rows[0]?.id ?? null;
}
