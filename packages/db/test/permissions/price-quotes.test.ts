import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;
let destinationId: string;
let tripQuoteId: string;
let destinationQuoteId: string;

const device = anonymousActor().device;

async function insertQuote(tripId: string | null): Promise<string> {
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      `INSERT INTO price_quotes (trip_id, kind, origin, destination_id, dates, amount_minor, currency, source, fetched_at, frozen_at)
       VALUES ($1, 'flight', 'SIN', $2, '[2026-11-11,2026-11-19)', 13900, 'USD', 'travelpayouts', now(), now())
       RETURNING id`,
      [tripId, destinationId],
    ),
  );
  return rows[0]!.id;
}

async function visibleQuotes(uid: string): Promise<string[]> {
  return withUser(db.pool, uid, device, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM price_quotes ORDER BY id');
    return rows.map((row) => row.id);
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('quote-dest', 'Quote Dest') RETURNING id",
    ),
  );
  destinationId = rows[0]!.id;
  tripQuoteId = await insertQuote(fixture.tripId);
  destinationQuoteId = await insertQuote(null);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('price_quotes RLS: trip rows for the crew, destination rows for everyone', () => {
  it.each(['organiserId', 'memberId'] as const)(
    'lets the trip %s read the trip quote',
    async (who) => {
      expect(await visibleQuotes(fixture[who])).toEqual([tripQuoteId, destinationQuoteId].sort());
    },
  );

  it('hides the trip quote from an outsider but not the destination quote', async () => {
    expect(await visibleQuotes(fixture.outsiderId)).toEqual([destinationQuoteId]);
  });

  it('hides the trip quote from an anonymous uid with no rows at all', async () => {
    expect(await visibleQuotes(anonymousActor().uid)).toEqual([destinationQuoteId]);
  });

  it('rejects an app_user write even from a trip member (system-only)', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, device, (tx) =>
        tx.query(
          `INSERT INTO price_quotes (trip_id, kind, amount_minor, currency, source, fetched_at)
           VALUES ($1, 'flight', 1, 'USD', 'user', now())`,
          [fixture.tripId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, fixture.organiserId, device, (tx) =>
        tx.query('UPDATE price_quotes SET amount_minor = 1 WHERE id = $1', [tripQuoteId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an unknown kind, source or currency code', async () => {
    for (const [kind, source, currency] of [
      ['cruise', 'travelpayouts', 'USD'],
      ['flight', 'skyscanner', 'USD'],
      ['flight', 'travelpayouts', 'usd'],
    ]) {
      await expect(
        withSystem(db.pool, (tx) =>
          tx.query(
            `INSERT INTO price_quotes (kind, amount_minor, currency, source, fetched_at)
             VALUES ($1, 1, $3, $2, now())`,
            [kind, source, currency],
          ),
        ),
      ).rejects.toThrow(/check constraint/i);
    }
  });
});
