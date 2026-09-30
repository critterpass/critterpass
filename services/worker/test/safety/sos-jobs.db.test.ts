/**
 * The SOS follow-ups against a migrated Postgres: an unanswered SOS escalates once (crew re-push,
 * sender prompt) and an answered one never does; responders' walking ETAs count from both latest
 * fixes, arrive within 50 m and stop the chain; the daily sweep keeps notes and threads 90 days and
 * closed sessions a year.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { purgeSafetyData } from '../../src/jobs/safety/safety-retention';
import { escalateSos, sosEscalateJob } from '../../src/jobs/safety/sos-escalate';
import { recountResponderEtas, sosResponderEtaJob } from '../../src/jobs/safety/sos-responder-eta';
import {
  insertCrew,
  insertTripUnderWay,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
let sender: string;
let alex: string;
let rin: string;
let tripId: string;
const SENDER_AT = { lat: -8.5031, lng: 115.2544 };

async function incident(status = 'open'): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `WITH share AS (
       INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'sos') RETURNING id)
     INSERT INTO help_sessions (id, trip_id, user_id, kind, status, share_id)
     SELECT id, $1, $2, 'sos', $3, id FROM share RETURNING id`,
    [tripId, sender, status],
  );
  return rows[0]!.id;
}

async function fix(shareId: string, uid: string, at: { lat: number; lng: number }): Promise<void> {
  await db.pool.query(
    `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, at)
     VALUES ($1, $2, $3, $4, $5, 8, now())`,
    [uid, tripId, shareId, at.lat, at.lng],
  );
}

async function coming(sosId: string, uid: string): Promise<string> {
  const share = await db.pool.query<{ id: string }>(
    "INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'sos') RETURNING id",
    [tripId, uid],
  );
  const shareId = share.rows[0]!.id;
  await db.pool.query(
    `UPDATE help_sessions SET status = 'responding', responder_ids = responder_ids || $2::uuid,
            responses = responses || jsonb_build_object($2::text,
              jsonb_build_object('state', 'coming', 'at', now(), 'share_id', $3::text))
      WHERE id = $1`,
    [sosId, uid, shareId],
  );
  return shareId;
}

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([sosEscalateJob(), sosResponderEtaJob(straightLineRouter)]);
  sender = await insertUser(db.pool);
  alex = await insertUser(db.pool);
  rin = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, [sender, alex, rin]);
  tripId = await insertTripUnderWay(db.pool, crewId, 'Asia/Makassar', [sender, alex, rin]);
}, 240_000);

afterAll(async () => {
  await db.stop();
});

describe('escalateSos', () => {
  it('pushes an unanswered SOS again and prompts the sender, once', async () => {
    const sosId = await incident();
    expect(await escalateSos(db.pool, sosId)).toEqual({ escalated: true });
    expect(await escalateSos(db.pool, sosId)).toEqual({ escalated: false });
    const events = await db.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'sos.escalated' AND aggregate_id = $1",
      [sosId],
    );
    expect(events.rowCount).toBe(1);
    const prompts = await db.pool.query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'sos.escalated'",
      [`user:#${sender}`],
    );
    expect(prompts.rowCount).toBe(1);
  });

  it('leaves an answered or resolved SOS alone', async () => {
    const answered = await incident('responding');
    expect(await escalateSos(db.pool, answered)).toEqual({ escalated: false });
    const done = await db.pool.query<{ id: string }>(
      `UPDATE help_sessions SET status = 'resolved', resolved_at = now() WHERE id = $1 RETURNING id`,
      [await incident()],
    );
    expect(await escalateSos(db.pool, done.rows[0]!.id)).toEqual({ escalated: false });
  });
});

describe('recountResponderEtas', () => {
  it('counts walking minutes to the sender, marks arrival within 50 m and stops when all are there', async () => {
    const sosId = await incident();
    await fix(sosId, sender, SENDER_AT);
    const alexShare = await coming(sosId, alex);
    const rinShare = await coming(sosId, rin);
    await fix(alexShare, alex, { lat: SENDER_AT.lat + 0.0003, lng: SENDER_AT.lng });
    await fix(rinShare, rin, { lat: SENDER_AT.lat + 0.004, lng: SENDER_AT.lng });

    const first = await recountResponderEtas(db.pool, sosId, straightLineRouter);
    const byUid = new Map(first.etas.map((eta) => [eta.uid, eta]));
    expect(byUid.get(alex)).toMatchObject({ arrived: true, eta_min: 0, estimate: true });
    expect(byUid.get(rin)?.arrived).toBe(false);
    expect(byUid.get(rin)?.eta_min).toBeGreaterThan(1);
    expect(first.reschedule).toBe(true);
    const next = await db.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'sos.responder_eta' AND data->>'sos_id' = $1",
      [sosId],
    );
    expect(next.rowCount).toBe(1);

    await fix(rinShare, rin, { lat: SENDER_AT.lat + 0.0002, lng: SENDER_AT.lng });
    const second = await recountResponderEtas(db.pool, sosId, straightLineRouter);
    expect(second.etas.map((eta) => eta.uid)).toEqual([rin]);
    expect(second.reschedule).toBe(false);
    const { rows } = await db.pool.query<{ responses: Record<string, { arrived_at?: string }> }>(
      'SELECT responses FROM help_sessions WHERE id = $1',
      [sosId],
    );
    expect(rows[0]?.responses[alex]?.arrived_at).toBeDefined();
    expect(rows[0]?.responses[rin]?.arrived_at).toBeDefined();
  });
});

describe('purgeSafetyData', () => {
  it('keeps notes and threads 90 days and closed sessions a year', async () => {
    const old = await incident();
    await db.pool.query(
      `INSERT INTO help_session_private (help_session_id, health_notes_enc, created_at)
       VALUES ($1, 'sealed', now() - interval '91 days')`,
      [old],
    );
    await db.pool.query(
      `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'hi', now() - interval '91 days')`,
      [old, tripId, sender],
    );
    const ancient = await incident();
    await db.pool.query(
      `UPDATE help_sessions SET status = 'resolved', resolved_at = now(),
              opened_at = now() - interval '400 days' WHERE id = $1`,
      [ancient],
    );
    const result = await purgeSafetyData(db.pool);
    expect(result).toEqual({ notes: 1, messages: 1, sessions: 1 });
    const kept = await db.pool.query('SELECT 1 FROM help_sessions WHERE id = $1', [old]);
    expect(kept.rowCount).toBe(1);
  });
});
