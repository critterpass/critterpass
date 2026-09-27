/**
 * A guide turn end to end over the real api stack: Better Auth session, Hono route through the SSE
 * helper, the gateway replaying Messages API fixtures at the network boundary, and the meter on a
 * migrated Postgres. Proves the quota lifecycle: one unit committed on `done`, given back on
 * refusal, provider failure or a client that leaves, and the 31st free question refused with the
 * next device-local midnight.
 */
import {
  buildSystemBlocks,
  createGateway,
  createToolRegistry,
  recordUsage,
  REPO_PACKS,
  type Gateway,
} from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { withSystem } from '@cp/db';
import { AI_ROUTES, type AiRoute } from '@cp/domain';
import { periodKey, periodResetAt } from '@cp/entitlements';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deviceTzFrom, streamGuideTurn } from '../../src/ai/sse-route-helper';
import { requireCommandSession } from '../../src/commands/_framework/session';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

const TZ = 'Asia/Ho_Chi_Minh';
let harness: CommandDoorsHarness;
let transport: FixtureTransport;
let gateway: Gateway;

function useFixtures(names: readonly string[]): void {
  transport = fixtureTransport(names);
  gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: transport.fetch,
    maxAttempts: 1,
    onUsage: (record) => recordUsage((fn) => withSystem(harness.pool, fn), record),
  });
}

beforeAll(async () => {
  const registry = createToolRegistry();
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => {
      app.post('/test/guide-turn', async (c) => {
        const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
        const body = await c.req.json<{ text: string; route?: string }>();
        const route = AI_ROUTES.find((r) => r === body.route) ?? 'guide.chat';
        return streamGuideTurn(
          {
            pool: deps.pool,
            gateway,
            registry,
            logger: pino({ level: 'silent' }),
            heartbeatMs: 60_000,
          },
          {
            meter: {
              uid: session.uid,
              device: 'device-1',
              deviceTz: deviceTzFrom(c.req.raw.headers),
              tripId: null,
            },
            turn: {
              route,
              system: buildSystemBlocks({ pack: REPO_PACKS.tokek }),
              messages: [{ role: 'user', content: body.text }],
              tool: { uid: session.uid, tripId: null, caller: 'C' },
              usage: { userId: session.uid },
            },
          },
        );
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
    .map((chunk) => {
      const event = /^event: (.+)$/mu.exec(chunk)?.[1] ?? '';
      const data = JSON.parse(/^data: (.+)$/mu.exec(chunk)?.[1] ?? '{}') as Record<string, unknown>;
      return { event, data };
    });
}

async function ask(cookie: string, text: string, route?: AiRoute): Promise<Response> {
  return harness.request('/test/guide-turn', {
    method: 'POST',
    headers: { cookie, 'x-cp-tz': TZ },
    body: JSON.stringify({ text, ...(route === undefined ? {} : { route }) }),
  });
}

async function used(uid: string): Promise<number> {
  const { rows } = await harness.pool.query<{ count: number }>(
    "SELECT count FROM usage_counters WHERE subject_id = $1 AND metric = 'guide_answers'",
    [uid],
  );
  return rows[0]?.count ?? 0;
}

async function outboxUsage(uid: string): Promise<Record<string, unknown>[]> {
  const { rows } = await harness.pool.query<{
    payload: { type: string; data: Record<string, unknown> };
  }>('SELECT payload FROM rt_outbox WHERE channel = $1 ORDER BY id', [`user:#${uid}`]);
  return rows.filter((row) => row.payload.type === 'usage.changed').map((row) => row.payload.data);
}

describe('guide turn over SSE', () => {
  it('streams tokens, then usage and done, and commits one unit', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['haiku-stream']);
    const response = await ask(me.cookie, 'Hi Tokek');
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const frames = parseFrames(await response.text());

    expect(frames.map((f) => f.event)).toEqual(['token', 'token', 'usage', 'done']);
    expect(frames.slice(0, 2).map((f) => f.data.text)).toEqual(['Sawasdee', ' krub!']);
    expect(frames[2]?.data).toMatchObject({ used: 1, limit: 30 });
    expect(frames[3]?.data).toEqual({ ai_generated: true, sources: [] });
    expect(await used(me.uid)).toBe(1);
    expect(await outboxUsage(me.uid)).toEqual([
      expect.objectContaining({ metric: 'guide_answers', used: 1, limit: 30 }),
    ]);
    const usageRows = await harness.pool.query('SELECT 1 FROM ai_usage WHERE user_id = $1', [
      me.uid,
    ]);
    expect(usageRows.rowCount).toBe(1);
  });

  it('runs a tool round, reports an unavailable tool honestly, and answers after it', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['haiku-stream-tool-use', 'haiku-stream-after-tool']);
    const frames = parseFrames(await (await ask(me.cookie, 'Night markets near us?')).text());

    expect(frames.map((f) => f.event)).toEqual([
      'token',
      'token',
      'tool_start',
      'tool_result',
      'token',
      'token',
      'token',
      'usage',
      'done',
    ]);
    expect(frames[2]?.data).toEqual({ tool: 'places_search', id: 'toolu_01StreamPlacesSearch1' });
    expect(frames[3]?.data).toEqual({
      id: 'toolu_01StreamPlacesSearch1',
      card: { tool: 'places_search', status: 'unavailable' },
    });
    const second = transport.requests[1] as { messages: { role: string; content: unknown }[] };
    expect(second.messages.at(-1)).toMatchObject({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_01StreamPlacesSearch1', is_error: true },
      ],
    });
    const firstTools = (transport.requests[0] as { tools: { name: string; strict: boolean }[] })
      .tools;
    expect(firstTools.every((tool) => tool.strict)).toBe(true);
    expect(firstTools.map((tool) => tool.name)).not.toContain('propose_expense');
    expect(await used(me.uid)).toBe(1);
    const usageRows = await harness.pool.query('SELECT 1 FROM ai_usage WHERE user_id = $1', [
      me.uid,
    ]);
    expect(usageRows.rowCount).toBe(2);
  });

  it('releases the unit when the model refuses', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['haiku-stream-refusal']);
    const frames = parseFrames(await (await ask(me.cookie, 'something off-limits')).text());
    expect(frames.at(-1)).toEqual({
      event: 'error',
      data: { code: 'AI_REFUSED', retryable: false },
    });
    expect(frames.map((f) => f.event)).not.toContain('done');
    expect(await used(me.uid)).toBe(0);
    expect((await outboxUsage(me.uid)).at(-1)).toMatchObject({ used: 0 });
  });

  it('releases the unit when the provider fails', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['overloaded-529']);
    const frames = parseFrames(await (await ask(me.cookie, 'Hi')).text());
    expect(frames).toEqual([{ event: 'error', data: { code: 'AI_UNAVAILABLE', retryable: true } }]);
    expect(await used(me.uid)).toBe(0);
  });

  it('releases the unit when the client disconnects mid-answer', async () => {
    const me = await harness.signInAnonymously();
    useFixtures(['haiku-stream']);
    const response = await ask(me.cookie, 'Hi');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: token');
    await reader.cancel();
    expect(await used(me.uid)).toBe(0);
  });

  it('refuses the 31st free question with the next device-local midnight', async () => {
    const me = await harness.signInAnonymously();
    const now = new Date();
    const key = periodKey(now, TZ);
    const resetAt = periodResetAt(key, TZ);
    await harness.pool.query(
      `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at)
       VALUES ('user', $1, 'guide_answers', $2, 30, 30, $3)`,
      [me.uid, key, resetAt],
    );
    useFixtures([]);
    const response = await ask(me.cookie, 'one more?');
    expect(response.status).toBe(402);
    const body = (await response.json()) as {
      error: { code: string; detail: { resetAt: string } };
    };
    expect(body.error.code).toBe('QUOTA_EXHAUSTED');
    expect(new Date(body.error.detail.resetAt).toISOString()).toBe(resetAt.toISOString());
    // Midnight in Asia/Ho_Chi_Minh (UTC+7) is 17:00 UTC.
    expect(resetAt.toISOString()).toMatch(/T17:00:00\.000Z$/u);
    expect(transport.requests).toHaveLength(0);
    expect(await used(me.uid)).toBe(30);
  });
});

describe('unlimited tiers and the silent fair-use cap', () => {
  async function unlimitedUserAt(count: number): Promise<{ cookie: string; uid: string }> {
    const me = await harness.signInAnonymously();
    const dayStart = new Date(new Date().toISOString().slice(0, 10));
    await harness.pool.query(
      'INSERT INTO user_entitlements (user_id, guide_unlimited_global) VALUES ($1, true)',
      [me.uid],
    );
    await harness.pool.query(
      `INSERT INTO fair_use_counters (user_id, metric, window_start, count, cap)
       VALUES ($1, 'guide_tokens', $2, $3, 300)`,
      [me.uid, dayStart, count],
    );
    return me;
  }

  it('is not metered, and over the cap moves the turn to Haiku with a short answer', async () => {
    const me = await unlimitedUserAt(300);
    useFixtures(['haiku-stream']);
    const frames = parseFrames(
      await (await ask(me.cookie, 'Plan tomorrow?', 'guide.chat_escalation')).text(),
    );
    expect(frames.map((f) => f.event)).toEqual(['token', 'token', 'done']);
    const request = transport.requests[0] as {
      model: string;
      messages: { content: { text: string }[] }[];
    };
    expect(request.model).toBe('claude-haiku-4-5-20251001');
    expect(request.messages[0]?.content[0]?.text).toContain('two short sentences');
    expect(await used(me.uid)).toBe(0);
  });

  it('answers with the busy line and no model call well past the cap', async () => {
    const me = await unlimitedUserAt(301);
    useFixtures([]);
    const frames = parseFrames(await (await ask(me.cookie, 'Again?')).text());
    expect(frames).toEqual([
      { event: 'error', data: { code: 'FAIR_USE_SLOWDOWN', retryable: true } },
    ]);
    expect(transport.requests).toHaveLength(0);
  });
});
