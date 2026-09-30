/**
 * The guide sheet's turn route end to end: Better Auth session, the Hono route, the gateway
 * replaying recorded DeepSeek streams at the network boundary, and the meter, threads and messages
 * on a migrated Postgres. Proves the free meter under concurrency (31 questions on a 30 limit get
 * exactly 30 answers), the release on a failed turn, and that moving the device zone never buys a
 * second free day.
 */
import { randomUUID } from 'node:crypto';

import { createGateway, createToolRegistry, recordUsage, type Gateway } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { withSystem } from '@cp/db';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiCompliance } from '../../src/ai/compliance';
import { readCrewProfiles, registerGuideToolExecutors } from '../../src/commands/guide/tools';
import { createKillSwitches } from '../../src/ops/kill-switches';
import { registerGuideTurnRoute } from '../../src/routes/guide';
import { seedGuideTrip } from '../ai/guide-action-seed';
import { startCommandDoors, type CommandDoorsHarness } from './command-doors-harness';

let harness: CommandDoorsHarness;
let transport: FixtureTransport;

const lazyGateway: Gateway = {
  streamModel: (...args) => gateway().streamModel(...args),
  callModel: (...args) => gateway().callModel(...args),
};
let current: Gateway | undefined;
const gateway = (): Gateway => {
  if (current === undefined) throw new Error('no fixtures loaded');
  return current;
};

function useFixtures(names: readonly string[]): void {
  transport = fixtureTransport(names);
  current = createGateway({
    apiKey: 'fixture-key',
    fetch: transport.fetch,
    maxAttempts: 1,
    onUsage: (record) => recordUsage((fn) => withSystem(harness.pool, fn), record),
  });
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => {
      const switches = createKillSwitches(deps.pool);
      const registry = createToolRegistry();
      registerGuideToolExecutors(registry, deps.pool);
      const logger = pino({ level: 'silent' });
      registerGuideTurnRoute(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        // The burst below is one person at 31 questions; the per-minute limit is not under test.
        turnsPerMinute: 1000,
        turn: {
          gateway: lazyGateway,
          switches,
          registry,
          // No decision provider configured: the input check passes (both providers down).
          compliance: createApiCompliance({
            pool: deps.pool,
            typesafeApiKey: undefined,
            gateway: undefined,
            switches,
            logger,
          }),
          logger,
          heartbeatMs: 60_000,
        },
      });
    },
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

interface Frame {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

function parseFrames(text: string): Frame[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.includes('event: '))
    .map((chunk) => ({
      event: /^event: (.+)$/mu.exec(chunk)?.[1] ?? '',
      data: JSON.parse(/^data: (.+)$/mu.exec(chunk)?.[1] ?? '{}') as Record<string, unknown>,
    }));
}

function ask(
  cookie: string,
  threadId: string,
  tz: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return harness.request(`/v1/guide/threads/${threadId}/turns`, {
    method: 'POST',
    headers: { cookie, 'x-cp-tz': tz },
    body: JSON.stringify({ text: 'Hi Tokek', ...body }),
  });
}

async function used(uid: string): Promise<{ period_key: string; count: number }[]> {
  const { rows } = await harness.pool.query<{ period_key: string; count: number }>(
    `SELECT period_key, count FROM usage_counters
      WHERE subject_id = $1 AND metric = 'guide_answers' ORDER BY period_key`,
    [uid],
  );
  return rows;
}

/** Spends `n` answers straight through the quota function, as `n` finished turns would. */
async function spend(uid: string, tz: string, n: number): Promise<void> {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  for (let i = 0; i < n; i += 1) {
    await harness.pool.query(
      "SELECT app.consume_quota('user', $1, 'guide_answers', $2, 30, now() + interval '1 day')",
      [uid, key],
    );
  }
}

describe('POST /v1/guide/threads/{id}/turns', () => {
  it('opens a private thread in the trip, records the question and saves the answer', async () => {
    const me = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, { organiser: me.uid, members: [] });
    useFixtures(['flash-stream']);
    const threadId = randomUUID();
    const frames = parseFrames(
      await (
        await ask(me.cookie, threadId, 'Asia/Ho_Chi_Minh', { context: { trip_id: tripId } })
      ).text(),
    );
    expect(frames.map((f) => f.event).filter((e) => e !== 'token')).toEqual(['usage', 'done']);
    expect(frames.find((f) => f.event === 'usage')?.data).toMatchObject({ used: 1, limit: 30 });

    const thread = await harness.pool.query(
      'SELECT user_id, trip_id, mode FROM guide_threads WHERE id = $1',
      [threadId],
    );
    expect(thread.rows).toEqual([{ user_id: me.uid, trip_id: tripId, mode: 'private' }]);
    const messages = await harness.pool.query<{
      role: string;
      content: string;
      meter_counted: boolean;
    }>(
      'SELECT role, content, meter_counted FROM guide_messages WHERE thread_id = $1 ORDER BY created_at',
      [threadId],
    );
    expect(messages.rows.map((m) => [m.role, m.meter_counted])).toEqual([
      ['user', false],
      ['guide', true],
    ]);
    expect(messages.rows[1]?.content).toMatch(/^Hi! Tokek here/u);
  });

  it(
    'answers exactly 30 of 31 concurrent questions on the free limit',
    { timeout: 120_000 },
    async () => {
      const me = await harness.signInAnonymously();
      useFixtures(Array.from({ length: 31 }, () => 'flash-stream'));
      const threadId = randomUUID();
      // The thread exists before the burst, so every request races on the meter alone.
      const first = await ask(me.cookie, threadId, 'Asia/Ho_Chi_Minh');
      await first.text();
      await harness.pool.query('DELETE FROM usage_counters WHERE subject_id = $1', [me.uid]);
      useFixtures(Array.from({ length: 31 }, () => 'flash-stream'));

      const responses = await Promise.all(
        Array.from({ length: 31 }, () => ask(me.cookie, threadId, 'Asia/Ho_Chi_Minh')),
      );
      const bodies = await Promise.all(responses.map((r) => r.text()));
      const answered = bodies.filter((body) => parseFrames(body).some((f) => f.event === 'done'));
      const refused = responses.filter((r) => r.status === 402);
      expect(answered).toHaveLength(30);
      expect(refused).toHaveLength(1);
      const error = JSON.parse(bodies[responses.findIndex((r) => r.status === 402)] ?? '{}') as {
        error: { code: string; detail: { used: number; limit: number } };
      };
      expect(error.error.code).toBe('QUOTA_EXHAUSTED');
      expect(error.error.detail).toMatchObject({ used: 30, limit: 30 });
      expect((await used(me.uid)).map((row) => row.count)).toEqual([30]);
    },
  );

  it('gives the unit back when the turn fails', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['flash-stream-decline']);
    const frames = parseFrames(await (await ask(me.cookie, randomUUID(), 'UTC')).text());
    expect(frames.at(-1)).toMatchObject({ event: 'error', data: { code: 'AI_REFUSED' } });
    expect((await used(me.uid)).map((row) => row.count)).toEqual([0]);
  });

  it('never grants a second free day when the device zone moves', async () => {
    const me = await harness.signInAnonymously();
    const east = 'Pacific/Kiritimati';
    const west = 'Pacific/Pago_Pago';
    await spend(me.uid, east, 30);
    useFixtures([]);
    const threadId = randomUUID();
    // Forward or back within the day: still the spent day.
    expect((await ask(me.cookie, threadId, east)).status).toBe(402);
    expect((await ask(me.cookie, threadId, west)).status).toBe(402);
    // A day later by the clock, a zone further west still names an older day: never a new one.
    await harness.pool.query(
      "UPDATE usage_counters SET started_at = started_at - interval '21 hours' WHERE subject_id = $1",
      [me.uid],
    );
    expect((await ask(me.cookie, threadId, west)).status).toBe(402);
    expect((await used(me.uid)).map((row) => row.count)).toEqual([30]);
  });

  it('ignores a forward zone change on the same real day', async () => {
    const me = await harness.signInAnonymously();
    await spend(me.uid, 'Pacific/Pago_Pago', 30);
    useFixtures([]);
    expect((await ask(me.cookie, randomUUID(), 'Pacific/Kiritimati')).status).toBe(402);
    expect((await used(me.uid)).map((row) => row.count)).toEqual([30]);
  });

  it('keeps a private thread from anyone else', async () => {
    const owner = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    useFixtures(['flash-stream']);
    const threadId = randomUUID();
    await (await ask(owner.cookie, threadId, 'UTC')).text();
    const response = await ask(other.cookie, threadId, 'UTC');
    expect(response.status).toBe(404);
  });
});

describe('guide tools', () => {
  it('shows crew dietary flags only where a member consented, and never private taste', async () => {
    const organiser = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, {
      organiser: organiser.uid,
      members: [member.uid],
    });
    // Flags exist only while consent stands (app.sync_dietary_flags); the member consented.
    await harness.pool.query(
      "INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, '{vegetarian,no_peanuts}')",
      [tripId, member.uid],
    );
    await harness.pool.query(
      "INSERT INTO taste_profiles (user_id, tags) VALUES ($1, '{street_food}')",
      [organiser.uid],
    );
    // The organiser hid their taste tags from the crew.
    await harness.pool.query(
      `INSERT INTO user_settings (user_id, hide_taste_tags) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET hide_taste_tags = true`,
      [organiser.uid],
    );
    const profiles = await readCrewProfiles(harness.pool, {
      uid: organiser.uid,
      tripId,
      caller: 'C',
      route: 'guide.chat',
    });
    const byUid = new Map(profiles.map((p) => [p.uid, p]));
    expect(byUid.get(member.uid)?.dietary_flags).toEqual(['vegetarian', 'no_peanuts']);
    expect(byUid.get(organiser.uid)).toMatchObject({ dietary_flags: [], taste_tags: [] });
  });
});
