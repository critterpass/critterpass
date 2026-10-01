/**
 * `help_session_messages` (C1, RLS T): the SOS thread. The trip's crew reads it; a participant
 * writes as themselves, only into an open session of that same trip; nobody edits or deletes.
 */
import { randomUUID } from 'node:crypto';

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
let nonParticipant: string;
let sosId: string;
let messageId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

const send = (uid: string, session: string, body = 'knee scraped, ok mostly') =>
  asUser(
    uid,
    `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), session, fx.tripId, uid, body],
  );

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  nonParticipant = await withSystem(db.pool, async (tx) => {
    const id = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fx.crewId, userId: id });
    return id;
  });
  const [sos] = await asUser<{ id: string }>(
    fx.memberId,
    "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'sos') RETURNING id",
    [fx.tripId, fx.memberId],
  );
  sosId = sos!.id;
  messageId = randomUUID();
  await asUser(
    fx.memberId,
    `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body)
     VALUES ($1, $2, $3, $4, 'came off the scooter')`,
    [messageId, sosId, fx.tripId, fx.memberId],
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('help_session_messages RLS', () => {
  it('shows the thread to the whole crew of the trip', async () => {
    for (const uid of [fx.organiserId, fx.memberId, nonParticipant]) {
      expect(await asUser(uid, 'SELECT id FROM help_session_messages')).toEqual([
        { id: messageId },
      ]);
    }
  });

  it('hides it from an outsider', async () => {
    expect(await asUser(fx.outsiderId, 'SELECT 1 FROM help_session_messages')).toEqual([]);
  });

  it('lets a participant reply as themselves, never as someone else', async () => {
    await send(fx.organiserId, sosId);
    await expect(
      asUser(
        fx.organiserId,
        `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body)
         VALUES ($1, $2, $3, $4, 'fake')`,
        [randomUUID(), sosId, fx.tripId, fx.memberId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses a crewmate off the trip, an outsider, and a resolved session', async () => {
    await expect(send(nonParticipant, sosId)).rejects.toThrow(/row-level security/i);
    await expect(send(fx.outsiderId, sosId)).rejects.toThrow(/row-level security/i);
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE help_sessions SET status = 'resolved', resolved_at = now() WHERE id = $1", [
        sosId,
      ]),
    );
    await expect(send(fx.memberId, sosId)).rejects.toThrow(/row-level security/i);
  });

  it('gives app_user no UPDATE and guide_reader nothing', async () => {
    await expect(
      asUser(fx.memberId, "UPDATE help_session_messages SET body = 'edited'"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM help_session_messages'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('help_session_messages stream', () => {
  let harness: StreamHarness;
  beforeAll(async () => {
    harness = await startStreamHarness();
    const { tripId, actors } = harness.fixture;
    await withSystem(harness.db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'sos') RETURNING id",
        [tripId, actors.member],
      );
      await tx.query(
        `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body)
         VALUES ($1, $2, $3, $4, 'on my way')`,
        [randomUUID(), rows[0]!.id, tripId, actors.organiser],
      );
    });
  }, 240_000);
  afterAll(async () => {
    await harness.stop();
  });

  it('syncs the thread to the crew on the trip stream and to nobody else', async () => {
    const params = { trip_id: harness.fixture.tripId };
    for (const actor of ['organiser', 'member'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['help_session_messages']).toHaveLength(1);
    }
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['help_session_messages'] ?? []).toEqual([]);
    }
  });
});
