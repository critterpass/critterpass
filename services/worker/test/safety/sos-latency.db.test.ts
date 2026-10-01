/**
 * The SOS fan-out's latency with the model unavailable: `sos.orchestrate` routes every crewmate's
 * ALWAYS push (one `push.send` per device) and their takeovers within 500 ms, while the summary
 * call to a model that never answers is still pending; the summary then gives up at its 3 s
 * budget and the sender's own words stand. The push ignores quiet hours and the daily budget.
 */
import { createGateway, writeSosSummary } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCopyRenderer } from '../../src/push';
import { registerSafetyNotifications } from '../../src/jobs/safety/notify';
import { sosEscalateJob } from '../../src/jobs/safety/sos-escalate';
import { orchestrateSos } from '../../src/jobs/safety/sos-orchestrate';
import { sosResponderEtaJob } from '../../src/jobs/safety/sos-responder-eta';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertTripUnderWay,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
let sender: string;
let crew: string[];
let tripId: string;
let crewId: string;

/** A model endpoint that never answers: every call hangs until its signal aborts. */
const unanswered = createGateway({
  apiKey: 'unanswered',
  maxAttempts: 1,
  fetch: (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
});

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([sosEscalateJob(), sosResponderEtaJob(straightLineRouter)]);
  registerSafetyNotifications();
  sender = await insertUser(db.pool, { tz: 'Asia/Makassar' });
  // Two of the five are in their quiet hours in a far zone; ALWAYS ignores that.
  crew = [];
  for (const tz of [
    'Asia/Makassar',
    'Asia/Makassar',
    'Asia/Makassar',
    'Pacific/Kiritimati',
    'Pacific/Honolulu',
  ]) {
    const uid = await insertUser(db.pool, { tz });
    await insertDevice(db.pool, uid, { platform: crew.length % 2 === 0 ? 'ios' : 'android', tz });
    crew.push(uid);
  }
  crewId = await insertCrew(db.pool, [sender, ...crew]);
  tripId = await insertTripUnderWay(db.pool, crewId, 'Asia/Makassar', [sender, ...crew]);
}, 240_000);

afterAll(async () => {
  await db.stop();
});

async function newIncident(): Promise<{ sosId: string; eventId: string }> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO help_sessions (trip_id, user_id, kind, status, preset, body)
     VALUES ($1, $2, 'sos', 'open', 'fell', 'came off the scooter') RETURNING id`,
    [tripId, sender],
  );
  const sosId = rows[0]!.id;
  const eventId = await insertEvent(
    db.pool,
    'sos.triggered',
    { trip_id: tripId, sos_id: sosId, crew_count: crew.length },
    { crewId, tripId, actorId: sender },
  );
  return { sosId, eventId };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

describe('sos.orchestrate with the model unavailable', { timeout: 60_000 }, () => {
  it('enqueues every push and takeover within 500 ms, then drops the summary at 3 s', async () => {
    const { sosId, eventId } = await newIncident();
    const started = Date.now();
    const run = orchestrateSos(
      db.pool,
      {
        renderer: createCopyRenderer(),
        summarise: async (input) =>
          (await writeSosSummary(unanswered, input, { timeoutMs: 3000 })).summary,
      },
      { sos_id: sosId, event_id: eventId },
    );

    let pushes = 0;
    let takeovers = 0;
    while (Date.now() - started < 2000 && (pushes < crew.length || takeovers < crew.length)) {
      pushes = await count(
        `SELECT count(*)::int AS n FROM pgboss.job j JOIN notifications n ON n.id::text = j.data->>'notification_id'
          WHERE j.name = 'push.send' AND n.dedupe_key = $1`,
        [`sos:${eventId}`],
      );
      takeovers = await count(
        "SELECT count(*)::int AS n FROM rt_outbox WHERE payload->>'type' = 'sos.takeover' AND payload->'data'->>'sos_id' = $1",
        [sosId],
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const fannedOut = Date.now() - started;
    expect(pushes).toBe(crew.length);
    expect(takeovers).toBe(crew.length);
    expect(fannedOut).toBeLessThan(500);

    const result = await run;
    const total = Date.now() - started;
    expect(result).toEqual({ recipients: crew.length, routed: crew.length, summary: 'none' });
    expect(total).toBeGreaterThanOrEqual(2900);
    expect(total).toBeLessThan(6000);
    const { rows } = await db.pool.query<{
      summary: string | null;
      alerted_count: number;
      sent: { state: string; n: number };
      classes: string[];
    }>(
      `SELECT s.summary, s.alerted_count, s.steps -> 'sent' AS sent,
              (SELECT array_agg(DISTINCT n.class) FROM notifications n WHERE n.dedupe_key = $2) AS classes
         FROM help_sessions s WHERE s.id = $1`,
      [sosId, `sos:${eventId}`],
    );
    expect(rows[0]).toMatchObject({
      summary: null,
      alerted_count: crew.length,
      sent: { state: 'done', n: crew.length },
      classes: ['always'],
    });
    const escalation = await count(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'sos.escalate' AND data->>'sos_id' = $1",
      [sosId],
    );
    expect(escalation).toBe(1);
  });

  it("keeps the sender's own words out of the push", async () => {
    const { sosId, eventId } = await newIncident();
    const deps = { renderer: createCopyRenderer() };
    await orchestrateSos(db.pool, deps, { sos_id: sosId, event_id: eventId });
    const { rows } = await db.pool.query<{ title: string; body: string; ctx: unknown }>(
      'SELECT title, body, ctx FROM notifications WHERE dedupe_key = $1',
      [`sos:${eventId}`],
    );
    expect(rows).toHaveLength(crew.length);
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain('scooter');
      expect(row.body).toMatch(/fell and needs a hand/u);
    }
  });

  it('sends nobody a second push when the orchestrator retries', async () => {
    const { sosId, eventId } = await newIncident();
    const deps = { renderer: createCopyRenderer() };
    await orchestrateSos(db.pool, deps, { sos_id: sosId, event_id: eventId });
    const again = await orchestrateSos(db.pool, deps, { sos_id: sosId, event_id: eventId });
    expect(again.routed).toBe(0);
    const pushes = await count(
      `SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = $1`,
      [`sos:${eventId}`],
    );
    expect(pushes).toBe(crew.length);
  });
});
