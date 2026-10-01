/**
 * `help_session_private` (C3, RLS X): the sender's health notes. Readable by the sender and the
 * crewmates coming to help, by nobody else in the crew, never by `guide_reader` or PowerSync, and
 * never part of the publication; only the sender writes them, on their own open session.
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
let responder: string;
let otherCrew: string;
let nonParticipant: string;
let sosId: string;
const device = anonymousActor().device;
const NOTES = 'sealed:v1:allergic-to-penicillin';

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  ({ responder, otherCrew, nonParticipant } = await withSystem(db.pool, async (tx) => {
    const ids = [await insertUser(tx), await insertUser(tx), await insertUser(tx)];
    for (const id of ids) await insertCrewMember(tx, { crewId: fx.crewId, userId: id });
    await insertTripParticipant(tx, { tripId: fx.tripId, userId: ids[0]!, rsvp: 'in' });
    await insertTripParticipant(tx, { tripId: fx.tripId, userId: ids[1]!, rsvp: 'in' });
    return { responder: ids[0]!, otherCrew: ids[1]!, nonParticipant: ids[2]! };
  }));
  const [sos] = await asUser<{ id: string }>(
    fx.memberId,
    "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'sos') RETURNING id",
    [fx.tripId, fx.memberId],
  );
  sosId = sos!.id;
  await asUser(
    fx.memberId,
    'INSERT INTO help_session_private (help_session_id, health_notes_enc) VALUES ($1, $2)',
    [sosId, NOTES],
  );
  await withSystem(db.pool, (tx) =>
    tx.query(
      "UPDATE help_sessions SET responder_ids = ARRAY[$2::uuid], status = 'responding' WHERE id = $1",
      [sosId, responder],
    ),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const readNotes = (uid: string) =>
  asUser<{ health_notes_enc: string }>(uid, 'SELECT health_notes_enc FROM help_session_private');

describe('help_session_private RLS', () => {
  it('lets the sender and a responder read the health notes', async () => {
    expect(await readNotes(fx.memberId)).toEqual([{ health_notes_enc: NOTES }]);
    expect(await readNotes(responder)).toEqual([{ health_notes_enc: NOTES }]);
  });

  it('hides them from the rest of the crew, participants or not, and from outsiders', async () => {
    for (const uid of [fx.organiserId, otherCrew, nonParticipant, fx.outsiderId]) {
      expect(await readNotes(uid)).toEqual([]);
    }
    expect(await readNotes(anonymousActor().uid)).toEqual([]);
  });

  it('stops showing them to a responder who leaves the crew', async () => {
    const leaver = await withSystem(db.pool, async (tx) => {
      const id = await insertUser(tx);
      await insertCrewMember(tx, { crewId: fx.crewId, userId: id, status: 'left' });
      await tx.query(
        'UPDATE help_sessions SET responder_ids = responder_ids || $2::uuid WHERE id = $1',
        [sosId, id],
      );
      return id;
    });
    expect(await readNotes(leaver)).toEqual([]);
  });

  it('never lets anyone but the sender write notes, nor anyone change them', async () => {
    await expect(
      asUser(
        responder,
        'INSERT INTO help_session_private (help_session_id, health_notes_enc) VALUES ($1, $2)',
        [sosId, 'x'],
      ),
    ).rejects.toThrow(/row-level security|duplicate key/i);
    await expect(
      asUser(fx.memberId, "UPDATE help_session_private SET health_notes_enc = 'x'"),
    ).rejects.toThrow(/permission denied/i);
  });

  it('gives guide_reader and powersync_repl nothing', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM help_session_private'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await db.pool.query<{ readable: boolean }>(
      `SELECT has_table_privilege('powersync_repl', 'help_session_private', 'SELECT') AS readable`,
    );
    expect(rows[0]?.readable).toBe(false);
  });

  it('keeps the notes out of the publication while the session rows are in it', async () => {
    const { rows } = await db.pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_publication_tables
        WHERE pubname = 'powersync' AND tablename LIKE 'help_session%' ORDER BY tablename`,
    );
    expect(rows.map((row) => row.tablename)).toEqual(['help_session_messages', 'help_sessions']);
  });
});

describe('help_session_private streams', () => {
  let harness: StreamHarness;
  beforeAll(async () => {
    harness = await startStreamHarness();
  }, 240_000);
  afterAll(async () => {
    await harness.stop();
  });

  it('is in no stream at all', () => {
    for (const stream of Object.values(harness.config.streams)) {
      for (const query of stream.queries) expect(query).not.toMatch(/help_session_private/);
    }
  });

  it('syncs nothing private to any actor on the trip stream', async () => {
    const params = { trip_id: harness.fixture.tripId };
    for (const actor of ['organiser', 'member', 'outsider'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['help_session_private'] ?? []).toEqual([]);
    }
  });
});
