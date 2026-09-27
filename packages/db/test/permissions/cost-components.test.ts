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
const device = anonymousActor().device;

const INSERT = `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared, amount_minor, currency, source, seen_at)
  VALUES ($1, 'cv_1', $2, $3, $4, $5, $6, $7, $8, now())`;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  await withSystem(db.pool, (tx) =>
    tx.query(INSERT, [
      fixture.tripId,
      'apartment',
      'stay',
      'group',
      true,
      72_000,
      'USD',
      'estimate',
    ]),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const visible = (uid: string) =>
  withUser(
    db.pool,
    uid,
    device,
    async (tx) =>
      (await tx.query<{ component_key: string }>('SELECT component_key FROM cost_components')).rows,
  );

describe('cost_components RLS', () => {
  it.each(['organiserId', 'memberId'] as const)('lets the trip %s read components', async (who) => {
    expect(await visible(fixture[who])).toEqual([{ component_key: 'apartment' }]);
  });

  it('hides components from an outsider and an anonymous uid', async () => {
    expect(await visible(fixture.outsiderId)).toEqual([]);
    expect(await visible(anonymousActor().uid)).toEqual([]);
  });

  it('rejects app_user writes', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, device, (tx) =>
        tx.query(INSERT, [fixture.tripId, 'x', 'fun', 'person', false, 1, 'USD', 'user']),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('accepts a missing price and rejects unknown kinds, units, sources and negative amounts', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(INSERT, [
        fixture.tripId,
        'fare-kul',
        'flight',
        'person',
        false,
        null,
        'USD',
        'travelpayouts',
      ]),
    );
    for (const [key, kind, unit, source, amount] of [
      ['a', 'cruise', 'person', 'user', 1],
      ['b', 'fun', 'bed', 'user', 1],
      ['c', 'fun', 'person', 'skyscanner', 1],
      ['d', 'fun', 'person', 'user', -1],
    ]) {
      await expect(
        withSystem(db.pool, (tx) =>
          tx.query(INSERT, [fixture.tripId, key, kind, unit, false, amount, 'USD', source]),
        ),
      ).rejects.toThrow(/check constraint/i);
    }
  });
});
