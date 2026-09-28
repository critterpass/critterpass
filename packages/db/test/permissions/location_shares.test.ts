/**
 * `location_shares` (C1, RLS T): every crew member of the trip sees who shares and until when;
 * only the owner opens or changes their own share; the rows sync on the `trip` stream only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertCrewMember, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fx: TripFixture;
let bystanderId: string;
let shareId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  bystanderId = await withSystem(db.pool, async (tx) => {
    const id = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fx.crewId, userId: id });
    return id;
  });
  const rows = await asUser<{ id: string }>(
    fx.organiserId,
    "INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'crew_map') RETURNING id",
    [fx.tripId, fx.organiserId],
  );
  shareId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('location_shares RLS', () => {
  it('shows a share to every crew member of the trip', async () => {
    for (const uid of [fx.organiserId, fx.memberId, bystanderId]) {
      expect(await asUser(uid, 'SELECT id FROM location_shares')).toEqual([{ id: shareId }]);
    }
  });

  it('hides it from an outsider and an anonymous uid', async () => {
    expect(await asUser(fx.outsiderId, 'SELECT 1 FROM location_shares')).toEqual([]);
    expect(await asUser(anonymousActor().uid, 'SELECT 1 FROM location_shares')).toEqual([]);
  });

  it("never lets a member open a share for someone else or on another crew's trip", async () => {
    await expect(
      asUser(
        fx.memberId,
        "INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'help')",
        [fx.tripId, fx.organiserId],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        fx.outsiderId,
        "INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'help')",
        [fx.tripId, fx.outsiderId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("lets only the owner pause their share; another member's update touches nothing", async () => {
    const other = await asUser(
      fx.memberId,
      'UPDATE location_shares SET paused = true WHERE id = $1 RETURNING id',
      [shareId],
    );
    expect(other).toEqual([]);
    const own = await asUser(
      fx.organiserId,
      'UPDATE location_shares SET paused = true WHERE id = $1 RETURNING id',
      [shareId],
    );
    expect(own).toEqual([{ id: shareId }]);
  });

  it('rejects an unknown reason and an inverted window', async () => {
    await expect(
      asUser(
        fx.memberId,
        "INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'stalk')",
        [fx.tripId, fx.memberId],
      ),
    ).rejects.toThrow(/location_shares_reason_check/);
    await expect(
      asUser(
        fx.memberId,
        `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
         VALUES ($1, $2, 'help', now(), now() - interval '1 minute')`,
        [fx.tripId, fx.memberId],
      ),
    ).rejects.toThrow(/location_shares_window_check/);
  });

  it('gives guide_reader nothing', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM location_shares'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('location streams', () => {
  let harness: StreamHarness;
  beforeAll(async () => {
    harness = await startStreamHarness();
  }, 240_000);
  afterAll(async () => {
    await harness.stop();
  });

  it('syncs a share to the crew on the trip stream and to nobody else', async () => {
    const params = { trip_id: harness.fixture.tripId };
    for (const actor of ['organiser', 'member'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['location_shares']).toHaveLength(1);
      expect(rows['location_fixes'] ?? []).toEqual([]);
      expect(rows['visits'] ?? []).toEqual([]);
      expect(rows['member_etas'] ?? []).toEqual([]);
    }
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['location_shares'] ?? []).toEqual([]);
    }
  });
});
