/**
 * `help_sessions` (C1, RLS T): the trip's crew sees every Help session and SOS, a stale SOS only
 * its sender; only a participant opens a session and only as themselves; every later change runs
 * as app_system. The sessions sync on the `trip` stream only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrewMember,
  insertTripParticipant,
  insertUser,
} from '../helpers/actors';
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
let otherCrew: string;
let nonParticipant: string;
let sosId: string;
let staleId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  ({ otherCrew, nonParticipant } = await withSystem(db.pool, async (tx) => {
    const other = await insertUser(tx);
    const bystander = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fx.crewId, userId: other });
    await insertCrewMember(tx, { crewId: fx.crewId, userId: bystander });
    await insertTripParticipant(tx, { tripId: fx.tripId, userId: other, rsvp: 'in' });
    return { otherCrew: other, nonParticipant: bystander };
  }));
  const [sos] = await asUser<{ id: string }>(
    fx.organiserId,
    "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'sos') RETURNING id",
    [fx.tripId, fx.organiserId],
  );
  sosId = sos!.id;
  staleId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO help_sessions (trip_id, user_id, kind, status)
       VALUES ($1, $2, 'sos', 'stale') RETURNING id`,
      [fx.tripId, fx.organiserId],
    );
    return rows[0]!.id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('help_sessions RLS', () => {
  it('shows an SOS to the whole crew of the trip, participants or not', async () => {
    for (const uid of [fx.memberId, otherCrew, nonParticipant]) {
      expect(await asUser(uid, 'SELECT id FROM help_sessions')).toEqual([{ id: sosId }]);
    }
  });

  it('shows a stale SOS to its sender only', async () => {
    const own = await asUser<{ id: string }>(
      fx.organiserId,
      'SELECT id FROM help_sessions ORDER BY id',
    );
    expect(own.map((row) => row.id).sort()).toEqual([sosId, staleId].sort());
  });

  it('hides every session from an outsider and an anonymous uid', async () => {
    expect(await asUser(fx.outsiderId, 'SELECT 1 FROM help_sessions')).toEqual([]);
    expect(await asUser(anonymousActor().uid, 'SELECT 1 FROM help_sessions')).toEqual([]);
  });

  it('lets only a participant open a session, and only as themselves', async () => {
    await expect(
      asUser(
        fx.memberId,
        "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'sos')",
        [fx.tripId, fx.organiserId],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        nonParticipant,
        "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'help')",
        [fx.tripId, nonParticipant],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(
        fx.outsiderId,
        "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'help')",
        [fx.tripId, fx.outsiderId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('gives app_user no UPDATE or DELETE, not even to the sender', async () => {
    await expect(
      asUser(fx.organiserId, "UPDATE help_sessions SET status = 'resolved' WHERE id = $1", [sosId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(fx.organiserId, 'DELETE FROM help_sessions WHERE id = $1', [sosId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an unknown kind, status or preset', async () => {
    await expect(
      asUser(
        fx.memberId,
        "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'panic')",
        [fx.tripId, fx.memberId],
      ),
    ).rejects.toThrow(/help_sessions_kind_check/);
    await expect(
      asUser(
        fx.memberId,
        "INSERT INTO help_sessions (trip_id, user_id, kind, preset) VALUES ($1, $2, 'sos', 'bored')",
        [fx.tripId, fx.memberId],
      ),
    ).rejects.toThrow(/help_sessions_preset_check/);
  });

  it('gives guide_reader nothing', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM help_sessions'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('help_sessions stream', () => {
  let harness: StreamHarness;
  beforeAll(async () => {
    harness = await startStreamHarness();
    const { tripId, actors } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO help_sessions (trip_id, user_id, kind, status)
         VALUES ($1, $2, 'sos', 'open'), ($1, $2, 'sos', 'stale')`,
        [tripId, actors.organiser],
      ),
    );
  }, 240_000);
  afterAll(async () => {
    await harness.stop();
  });

  it('syncs sessions to the crew on the trip stream, a stale one to its sender only', async () => {
    const params = { trip_id: harness.fixture.tripId };
    const sender = idsByTable(await harness.rows('trip', 'organiser', params));
    expect(sender['help_sessions']).toHaveLength(2);
    const member = idsByTable(await harness.rows('trip', 'member', params));
    expect(member['help_sessions']).toHaveLength(1);
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['help_sessions'] ?? []).toEqual([]);
    }
  });
});
