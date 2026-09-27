import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { appendDomainEvent, runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import {
  getAnalyticsEventSchema,
  isAnalyticsEventName,
  userPid,
  type DomainEventInput,
} from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createPostHogSink,
  EXPORT_CURSOR_KEY,
  exportDomainEvents,
  type PostHogEvent,
} from '../../src/analytics-export';
import { insertUser } from '../notify-fixtures';

const SALT = 'test-analytics-pid-salt';
const BATCH_OK = readFileSync(
  new URL('../fixtures/posthog/batch-ok.json', import.meta.url),
  'utf8',
);

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

/** PostHog's HTTP boundary: batches recorded, answered with the recorded `/batch/` reply. */
let batches: { url: string; body: { api_key: string; batch: PostHogEvent[] } }[] = [];
let status = 200;
const sink = createPostHogSink({
  apiKey: 'phc_test',
  fetch: (url, init) => {
    batches.push({
      url: url instanceof Request ? url.url : url.toString(),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as never,
    });
    return Promise.resolve(new Response(BATCH_OK, { status }));
  },
});
const sent = () => batches.flatMap((batch) => batch.body.batch);

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

beforeEach(async () => {
  batches = [];
  status = 200;
  await pool.query('DELETE FROM ops.ops_config WHERE key = $1', [EXPORT_CURSOR_KEY]);
  await pool.query('DELETE FROM domain_events');
});

async function consent(uid: string, granted: boolean) {
  await pool.query(
    `INSERT INTO consents (user_id, purpose, granted_at, revoked_at, copy_version)
     VALUES ($1, 'analytics', now() - interval '1 day', CASE WHEN $2 THEN NULL ELSE now() END, 'v1')`,
    [uid, granted],
  );
}

async function append(
  input: Omit<DomainEventInput, 'aggregateKind' | 'actorKind'> & Partial<DomainEventInput>,
) {
  return withSystem(pool, (tx) =>
    appendDomainEvent(tx, { aggregateKind: 'crew', actorKind: 'user', ...input }),
  );
}

const joined = (crewId: string, uid: string) =>
  append({
    type: 'crew.member_joined',
    aggregateId: crewId,
    actorId: uid,
    payload: { crew_id: crewId, user_id: uid },
    crewId,
  });

describe('analytics export', { timeout: 60_000 }, () => {
  it('sends consented events under the pid and skips everyone else', async () => {
    const [granted, never, revoked] = [
      await insertUser(pool),
      await insertUser(pool),
      await insertUser(pool),
    ];
    await consent(granted, true);
    await consent(revoked, false);
    const crew = randomUUID();
    const grantedEvent = await joined(crew, granted);
    await joined(crew, never);
    await joined(crew, revoked);
    await append({
      type: 'trip.created',
      aggregateKind: 'trip',
      aggregateId: randomUUID(),
      actorId: granted,
      payload: { trip_id: randomUUID(), crew_id: crew },
    });

    const result = await exportDomainEvents({ pool, sink, pidSalt: SALT });
    expect(result).toEqual({ ran: true, read: 4, sent: 1 });
    const pid = await userPid(granted, SALT);
    expect(sent()).toEqual([
      {
        event: 'crew_joined',
        uuid: grantedEvent.id,
        distinct_id: pid,
        timestamp: expect.any(String) as string,
        properties: { crew_id: crew, platform: 'server', user_pid: pid },
      },
    ]);
    expect(batches[0]?.url).toBe('https://eu.i.posthog.com/batch/');
    expect(JSON.stringify(batches)).not.toContain(granted);
  });

  it('advances the cursor, and a replay from the start resends the same uuids', async () => {
    const uid = await insertUser(pool);
    await consent(uid, true);
    const crew = randomUUID();
    await joined(crew, uid);
    await joined(randomUUID(), uid);

    await exportDomainEvents({ pool, sink, pidSalt: SALT, batchSize: 1 });
    await exportDomainEvents({ pool, sink, pidSalt: SALT, batchSize: 1 });
    expect(await exportDomainEvents({ pool, sink, pidSalt: SALT })).toEqual({
      ran: true,
      read: 0,
      sent: 0,
    });
    const first = sent().map((event) => event.uuid);
    expect(first).toHaveLength(2);

    await pool.query('DELETE FROM ops.ops_config WHERE key = $1', [EXPORT_CURSOR_KEY]);
    batches = [];
    await exportDomainEvents({ pool, sink, pidSalt: SALT });
    expect(sent().map((event) => event.uuid)).toEqual(first);
  });

  it('keeps the cursor when PostHog rejects the batch', async () => {
    const uid = await insertUser(pool);
    await consent(uid, true);
    await joined(randomUUID(), uid);
    status = 503;
    await expect(exportDomainEvents({ pool, sink, pidSalt: SALT })).rejects.toThrow(/HTTP 503/u);
    const { rows } = await pool.query('SELECT 1 FROM ops.ops_config WHERE key = $1', [
      EXPORT_CURSOR_KEY,
    ]);
    expect(rows).toHaveLength(0);
    status = 200;
    expect(await exportDomainEvents({ pool, sink, pidSalt: SALT })).toMatchObject({ sent: 1 });
  });

  it('sends allow-listed billing events without consent, with no person profile', async () => {
    const uid = await insertUser(pool);
    const event = await joined(randomUUID(), uid);
    const mappers = {
      'crew.member_joined': () => ({
        event: 'referral_qualified' as const,
        subjectUid: uid,
        properties: {},
      }),
    };
    await exportDomainEvents({ pool, sink, pidSalt: SALT, mappers });
    expect(sent()).toEqual([
      expect.objectContaining({
        event: 'referral_qualified',
        distinct_id: `srv_${event.id}`,
        properties: expect.not.objectContaining({
          user_pid: expect.anything() as unknown,
        }) as unknown,
      }),
    ]);
    expect(sent()[0]?.properties['$process_person_profile']).toBe(false);
  });

  it('sends events about no person anonymously', async () => {
    const trip = randomUUID();
    const event = await append({
      type: 'change_set.applied',
      aggregateKind: 'trip',
      aggregateId: trip,
      actorKind: 'guide',
      actorId: null,
      payload: { trip_id: trip, change_set_id: randomUUID(), result_version_id: randomUUID() },
      tripId: trip,
    });
    await exportDomainEvents({ pool, sink, pidSalt: SALT });
    expect(sent()).toEqual([
      expect.objectContaining({
        event: 'changeset_applied',
        distinct_id: `srv_${event.id}`,
        properties: { trip_id: trip, platform: 'server', $process_person_profile: false },
      }),
    ]);
  });

  it('never sends a property outside the catalog', async () => {
    const uid = await insertUser(pool);
    await consent(uid, true);
    const trip = randomUUID();
    await append({
      type: 'rsvp.changed',
      aggregateKind: 'trip',
      aggregateId: trip,
      actorId: uid,
      payload: { trip_id: trip, user_id: uid, rsvp: 'in' },
      tripId: trip,
    });
    await exportDomainEvents({ pool, sink, pidSalt: SALT });
    for (const event of sent()) {
      expect(isAnalyticsEventName(event.event)).toBe(true);
      const allowed = Object.keys(getAnalyticsEventSchema(event.event as 'rsvp_changed').shape);
      expect(Object.keys(event.properties).every((key) => allowed.includes(key))).toBe(true);
    }
    expect(sent().map((event) => event.event)).toEqual(['rsvp_changed']);
  });
});
