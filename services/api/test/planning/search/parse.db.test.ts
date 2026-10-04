/**
 * `POST /v1/trips/{id}/search/parse` on the real schema and the real gateway, with DeepSeek's
 * recorded reply at the network boundary: "quiet dinner near the villa, open late" on the Bali
 * trip (Wednesday's dinner booked at Locavore) reads as the five chips of 7d-2 with the line under
 * them. A busy model, a switched-off route, no model key and a spent daily cap all answer a name
 * search over the whole question; a caller not on the trip gets NOT_FOUND.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { DomainError, searchParseResultSchema } from '@cp/domain';
import { OpenAPIHono } from '@hono/zod-openapi';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { AppEnv } from '../../../src/app';
import { createKillSwitches } from '../../../src/ops/kill-switches';
import { registerSearchParseRoute } from '../../../src/planning/search/parse-route';
import { startBaliTrip, type BaliTrip } from './bali-fixture';

const QUESTION = 'quiet dinner near the villa, open late';
const recording = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/search-parse-quiet-dinner.json'), 'utf8'),
) as { responses: { status: number; body: unknown }[] };

let bali: BaliTrip;
let calls: number;

beforeAll(async () => {
  bali = await startBaliTrip();
}, 240_000);

afterAll(async () => {
  await bali?.stop();
});

beforeEach(async () => {
  calls = 0;
  await bali.pool.query(
    "DELETE FROM ops.ops_config WHERE key IN ('ai.search.parse.enabled', 'fair_use.search_parse_per_day')",
  );
  await bali.pool.query('DELETE FROM fair_use_counters');
});

type Reply = { status: number; body: unknown };

function appWith(reply: Reply | null): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const gateway =
    reply === null
      ? undefined
      : createGateway({
          apiKey: 'test-key',
          maxAttempts: 1,
          assertRouteOn: createKillSwitches(bali.pool).assertAiRoute,
          fetch: () => {
            calls += 1;
            return Promise.resolve(
              new Response(JSON.stringify(reply.body), {
                status: reply.status,
                headers: { 'content-type': 'application/json' },
              }),
            );
          },
        });
  registerSearchParseRoute(app, {
    pool: bali.pool,
    sessions: (headers) => {
      const uid = headers.get('x-test-uid');
      return Promise.resolve(uid === null ? null : { uid, isAnonymous: false });
    },
    gateway,
  });
  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json(error.toResponseBody(), error.http as never);
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION' } }, 422);
    return c.json({ error: { code: 'INTERNAL', message: String(error) } }, 500);
  });
  return app;
}

const recorded = (): Reply => recording.responses[0] as Reply;
const busy: Reply = {
  status: 529,
  body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
};

async function parse(app: OpenAPIHono<AppEnv>, uid = bali.organiser, q = QUESTION) {
  const response = await app.request(`http://localhost/v1/trips/${bali.tripId}/search/parse`, {
    method: 'POST',
    headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
    body: JSON.stringify({ q }),
  });
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as unknown,
  };
}

const nameSearch = { filters: { text: QUESTION }, chips: [] };

describe('POST /v1/trips/{id}/search/parse', () => {
  it('reads the question as the five chips of 7d-2, leaving out booked Wednesday', async () => {
    const { status, cache, body } = await parse(appWith(recorded()));
    expect(status).toBe(200);
    expect(cache).toContain('no-store');
    const result = searchParseResultSchema.parse(body);
    const wednesday = bali.dayIds[2] as string;
    expect(result.chips).toEqual([
      { code: 'meal', params: { meal: 'dinner' } },
      { code: 'attribute', params: { attribute: 'quiet' } },
      { code: 'max_minutes', params: { from: 'stay', minutes: 15 } },
      { code: 'open_past', params: { time: '22:00' } },
      { code: 'exclude_days', params: { day_ids: [wednesday] } },
    ]);
    expect(result.exclude_reason).toEqual({
      code: 'day_has_meal',
      params: { day_ids: [wednesday], stable_id: bali.locavoreStableId },
    });
    expect(calls).toBe(1);
  });

  it('falls back to a name search when the model is busy', async () => {
    expect((await parse(appWith(busy))).body).toEqual(nameSearch);
    expect(calls).toBe(1);
  });

  it('falls back without a call when the route is switched off or no model is configured', async () => {
    await bali.pool.query(
      "INSERT INTO ops.ops_config (key, value) VALUES ('ai.search.parse.enabled', 'false'::jsonb)",
    );
    expect((await parse(appWith(recorded()))).body).toEqual(nameSearch);
    expect((await parse(appWith(null))).body).toEqual(nameSearch);
    expect(calls).toBe(0);
  });

  it('answers a name search once the daily cap is spent, without a model call', async () => {
    await bali.pool.query(
      "INSERT INTO ops.ops_config (key, value) VALUES ('fair_use.search_parse_per_day', '1'::jsonb)",
    );
    const app = appWith(recorded());
    expect(searchParseResultSchema.parse((await parse(app)).body).chips).toHaveLength(5);
    expect((await parse(app)).body).toEqual(nameSearch);
    expect(calls).toBe(1);
  });

  it('is NOT_FOUND for a caller not on the trip', async () => {
    expect((await parse(appWith(recorded()), bali.outsider)).status).toBe(404);
    expect(calls).toBe(0);
  });
});
