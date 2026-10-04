/**
 * Add from a link on the real schema, with recorded answers at both network boundaries (TikTok's
 * oEmbed and DeepSeek's `links.extract_places` reply): the @balibites waterfalls post streams
 * `source`, Tukad Cepung and Tibumana as sure matches, the swing with the view as a pick of three,
 * then `done`. A screenshot about Hanoi answers `source` and `done` with zeros, a maps link skips
 * the model, a platform the config leaves out asks for a screenshot, and no import writes a row.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { startRedis } from '@cp/db/testing';
import { DomainError, importEventSchema, type ImportEvent } from '@cp/domain';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { AppEnv } from '../../../src/app';
import { registerImportRoutes } from '../../../src/planning/imports/routes';
import { tripStaySource } from '../../../src/planning/stay';
import { startBaliTrip, type BaliPlace, type BaliTrip } from '../search/bali-fixture';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');
const modelReply = (name: string) =>
  (JSON.parse(fixture(name)) as { responses: { status: number; body: unknown }[] }).responses[0];

const BALIBITES = 'https://www.tiktok.com/@balibites/video/7421993381244522760';
const TEGALLALANG = 'Jl. Raya Tegallalang, Tegallalang, Gianyar Regency';
const place = (
  name: string,
  category: string,
  lat: number,
  lng: number,
  address: string,
  tags: string[] = [],
): BaliPlace => ({
  name,
  category,
  at: { lat, lng },
  address,
  tags,
});
const WATERFALLS: readonly BaliPlace[] = [
  place('Tukad Cepung Waterfall', 'nature', -8.4456, 115.3877, 'Tembuku, Bangli Regency', [
    'waterfall',
  ]),
  place('Tibumana Waterfall', 'nature', -8.5136, 115.3218, 'Apuan, Susut, Bangli Regency', [
    'waterfall',
  ]),
  place('Tibumana Guesthouse', 'stay', -8.514, 115.32, 'Apuan, Susut, Bangli Regency'),
  place('Alas Harum Swing', 'other', -8.4316, 115.2785, TEGALLALANG, ['swing', 'view']),
  place('Aloha Ubud Swing', 'other', -8.4205, 115.2772, TEGALLALANG, ['swing', 'view']),
  place('Tegallalang Jungle Swing', 'other', -8.4251, 115.2791, TEGALLALANG, ['swing', 'view']),
  place('Tegallalang Rice Terrace', 'nature', -8.4312, 115.2793, TEGALLALANG, ['view']),
];

let bali: BaliTrip;
let redis: RedisClientType;
let stopRedis: () => Promise<unknown>;
let app: OpenAPIHono<AppEnv>;
let replies: { status: number; body: unknown }[];
let modelCalls: number;
let platformCalls: string[];

beforeAll(async () => {
  const container = await startRedis();
  stopRedis = () => container.stop();
  redis = createClient({ url: container.getConnectionUrl() });
  await redis.connect();
  bali = await startBaliTrip(WATERFALLS);
  app = new OpenAPIHono<AppEnv>();
  registerImportRoutes(app, {
    pool: bali.pool,
    sessions: (headers) => {
      const uid = headers.get('x-test-uid');
      return Promise.resolve(uid === null ? null : { uid, isAnonymous: false });
    },
    redis,
    gateway: createGateway({
      apiKey: 'test-key',
      maxAttempts: 1,
      fetch: () => {
        modelCalls += 1;
        const reply = replies.shift();
        if (reply === undefined) return Promise.reject(new Error('no recorded reply left'));
        return Promise.resolve(
          new Response(JSON.stringify(reply.body), {
            status: reply.status,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    }),
    gemini: undefined,
    readers: {
      fetch: (input) => {
        platformCalls.push(input);
        const url = new URL(input);
        if (url.pathname === '/oembed' && url.searchParams.get('url') === BALIBITES) {
          return Promise.resolve(new Response(fixture('tiktok-oembed-balibites.json')));
        }
        return Promise.reject(new Error(`no recorded response for ${input}`));
      },
    },
    fit: { stays: tripStaySource, now: () => new Date('2026-10-04T00:00:00Z') },
  });
  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json(error.toResponseBody(), error.http as never);
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION' } }, 422);
    return c.json({ error: { code: 'INTERNAL', message: String(error) } }, 500);
  });
}, 240_000);

afterAll(async () => {
  redis?.destroy();
  await stopRedis?.();
  await bali?.stop();
});

beforeEach(async () => {
  replies = [];
  modelCalls = 0;
  platformCalls = [];
  await bali.pool.query("DELETE FROM ops.ops_config WHERE key = 'imports.platforms'");
});

function parseSse(text: string): ImportEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const event = /^event: (.+)$/mu.exec(block)?.[1];
      const data = /^data: (.+)$/mu.exec(block)?.[1] ?? 'null';
      return importEventSchema.parse({ event, data: JSON.parse(data) as unknown });
    });
}

async function importing(body: unknown, uid = bali.organiser) {
  const response = await app.request(`http://localhost/v1/trips/${bali.tripId}/imports`, {
    method: 'POST',
    headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    events: response.status === 200 ? parseSse(text) : [],
  };
}

/** Row counts of every table but the silent fair-use counter (a count, not post content). */
async function tableCounts(): Promise<Record<string, number>> {
  const { rows } = await bali.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'fair_use_counters'`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name: table } of rows) {
    const result = await bali.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${table}"`,
    );
    counts[table] = result.rows[0]?.n ?? 0;
  }
  return counts;
}

describe('POST /v1/trips/{id}/imports', () => {
  it('streams the balibites waterfalls: two sure, the swing a pick of three, then done', async () => {
    replies = [modelReply('link-extract-balibites.json')!];
    const { status, type, events } = await importing({ url: BALIBITES });
    expect(status).toBe(200);
    expect(type).toContain('text/event-stream');
    expect(events.map((event) => event.event)).toEqual([
      'source',
      'match',
      'match',
      'ambiguous',
      'done',
    ]);
    const [source, first, second, swing, done] = events;
    expect(source?.data).toMatchObject({
      platform: 'tiktok',
      read: 'post_text',
      author: 'Bali Bites',
    });
    expect(first?.data).toMatchObject({
      label: 'Tukad Cepung',
      poi_id: bali.places.get('Tukad Cepung Waterfall'),
    });
    expect(second?.data).toMatchObject({
      label: 'Tibumana',
      poi_id: bali.places.get('Tibumana Waterfall'),
    });
    expect(first?.event === 'match' && 'fit_best' in first.data).toBe(true);
    expect(swing?.event).toBe('ambiguous');
    if (swing?.event === 'ambiguous') {
      expect(swing.data.candidates.map((candidate) => candidate.name).sort()).toEqual([
        'Alas Harum Swing',
        'Aloha Ubud Swing',
        'Tegallalang Jungle Swing',
      ]);
      expect(swing.data.candidates[0]?.meta).toBe('Tegallalang');
    }
    expect(done?.data).toEqual({ matched: 2, ambiguous: 1, unknown: 0 });
  });

  it('answers a screenshot about another city with source and zeros', async () => {
    replies = [modelReply('link-extract-hanoi-cafes.json')!];
    const { events } = await importing({
      kind: 'screenshot',
      text: 'Top 5 cafes in Hanoi ☕\nCộng Cà Phê on Nhà Thờ\nGiảng Café for egg coffee',
    });
    expect(events).toEqual([
      { event: 'source', data: { platform: 'screenshot', read: 'ocr_text' } },
      { event: 'done', data: { matched: 0, ambiguous: 0, unknown: 0 } },
    ]);
  });

  it('matches a maps link from the URL alone, with no model call', async () => {
    const { events } = await importing({
      url: 'https://www.google.com/maps/place/Tibumana+Waterfall/@-8.5136,115.3218,17z',
    });
    expect(events.map((event) => event.event)).toEqual(['source', 'match', 'done']);
    expect(events[0]?.data).toMatchObject({ platform: 'google_maps', read: 'map_link' });
    expect(events[1]?.data).toMatchObject({ poi_id: bali.places.get('Tibumana Waterfall') });
    expect(modelCalls).toBe(0);
    expect(platformCalls).toEqual([]);
  });

  it('asks for a screenshot when the platform is left out or gives no caption', async () => {
    await bali.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('imports.platforms', '["youtube"]'::jsonb)`,
    );
    expect((await importing({ url: BALIBITES })).events).toEqual([
      { event: 'error', data: { code: 'unsupported_link' } },
    ]);
    expect((await importing({ url: 'https://www.instagram.com/p/Cabc/' })).events).toEqual([
      { event: 'error', data: { code: 'unsupported_link' } },
    ]);
    expect(platformCalls).toEqual([]);
  });

  it('writes no row while importing', async () => {
    const before = await tableCounts();
    replies = [modelReply('link-extract-balibites.json')!];
    expect((await importing({ url: BALIBITES })).events).toHaveLength(5);
    expect(await tableCounts()).toEqual(before);
  });

  it('is NOT_FOUND for a caller not on the trip', async () => {
    expect((await importing({ url: BALIBITES }, bali.outsider)).status).toBe(404);
    expect(modelCalls).toBe(0);
  });
});

describe('GET /v1/imports/preview', () => {
  it('answers the oEmbed title, author and thumbnail, uncached', async () => {
    const response = await app.request(
      `http://localhost/v1/imports/preview?url=${encodeURIComponent(BALIBITES)}`,
      { headers: { 'x-test-uid': bali.organiser } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = (await response.json()) as Record<string, string>;
    expect(body).toMatchObject({ platform: 'tiktok', author: 'Bali Bites' });
    expect(body['title']).toContain('Tukad Cepung');
    expect(body['thumb_url']).toMatch(/^https:\/\//u);
    expect(modelCalls).toBe(0);
  });
});
