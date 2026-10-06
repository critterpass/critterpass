import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import '@takumi-rs/wasm/auto';
import { Renderer } from '@takumi-rs/wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ogCacheKey } from './cache';
import type { CardWords } from './cards';
import { MemoryBucket, loadPublicAsset } from './og-test-support';
import { renderCard } from './render';
import { OG_TEMPLATE_VERSION, serveOg } from './serve';
import { inviteTemplate } from './templates/invite';
import { planTemplate } from './templates/plan';
import { referralTemplate } from './templates/referral';
import { PALETTE } from './templates/shared';
import { tipTemplate } from './templates/tip';

const GOLDEN_DIR = new URL('./golden/', import.meta.url);
const WORDS: CardWords = {
  referralTitle: 'Trips are better with tagalongs',
  referralEyebrow: (name) => (name === null ? 'Bring your crew' : `${name} invited you`),
  referralBody: (name) => `${name ?? 'A friend'} wants you on CritterPass.`,
  estimateEach: (amount) => `~${amount} each`,
  plan: (plan) => ({
    eyebrow: `Crew plan · ${plan.destination_name}`,
    headline: `${plan.days_count} days in ${plan.destination_name}`,
    chips: [`${plan.days_count} days`, `Crew of ${plan.crew_size}`],
  }),
};
const PLAN_TOKEN = 'KyotoSlowly4Days0Token01';
const PLAN = {
  kind: 'plan',
  shared_plan_id: '0190a6f1-7aaa-7bbb-8ccc-123456789abc',
  title: null,
  destination_name: 'Kyoto',
  days_count: 4,
  travel_month: 4,
  travel_year: 2026,
  crew_size: 3,
  crew_names: null,
  travelled: true,
  tags: [],
  days: [],
  rating_avg: null,
  rating_count: 0,
  copies_count: 0,
};

/** Decoded RGBA of a PNG, through Takumi itself (an image node drawn 1:1 into raw pixels). */
async function pixels(png: Uint8Array): Promise<Uint8Array> {
  const renderer = new Renderer();
  const raw = await renderer.render(
    { type: 'image', src: 'png', width: 1200, height: 630 },
    { width: 1200, height: 630, format: 'raw', images: [{ src: 'png', data: png }] },
  );
  renderer.free();
  return raw;
}

/** Share of pixels whose channels differ by more than a small anti-aliasing tolerance. */
async function difference(a: Uint8Array, b: Uint8Array): Promise<number> {
  const [left, right] = await Promise.all([pixels(a), pixels(b)]);
  let changed = 0;
  for (let index = 0; index < left.length; index += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      if (Math.abs((left[index + channel] ?? 0) - (right[index + channel] ?? 0)) > 24) {
        changed += 1;
        break;
      }
    }
  }
  return changed / (left.length / 4);
}

/** Compares against `golden/<name>.png`; `UPDATE_GOLDEN=1` rewrites it. */
async function expectGolden(name: string, png: Uint8Array): Promise<void> {
  const file = new URL(`${name}.png`, GOLDEN_DIR);
  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(file)) writeFileSync(file, png);
  expect(await difference(png, new Uint8Array(readFileSync(file)))).toBeLessThan(0.005);
}

function expectCardSize(png: Uint8Array): void {
  // PNG IHDR: width and height, big-endian, at bytes 16..23.
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  expect(png.byteLength).toBeLessThan(300 * 1024);
}

describe('OG cards', { timeout: 60_000 }, () => {
  it('draws the invite card', async () => {
    const png = await renderCard(
      inviteTemplate({
        eyebrow: "You're invited",
        headline: 'Winston wants you in Bali',
        chips: ['Oct 12 – 19', '~$1,240 each', 'The Bali Six'],
        code: 'SANDY4',
        guide: 'gecko',
      }),
      ['gecko'],
      loadPublicAsset,
    );
    expectCardSize(png);
    await expectGolden('invite', png);
  });

  it('draws the referral card', async () => {
    const png = await renderCard(
      referralTemplate({
        eyebrow: 'Winston invited you',
        headline: 'Trips are better with tagalongs',
        body: 'Winston wants you on CritterPass, the group trip planner.',
        guide: 'gecko',
      }),
      ['gecko'],
      loadPublicAsset,
    );
    expectCardSize(png);
    await expectGolden('referral', png);
  });

  it('draws the crew plan card', async () => {
    const png = await renderCard(
      planTemplate({
        eyebrow: 'Crew plan · Kyoto',
        headline: '4 days in Kyoto',
        chips: ['4 days', 'April 2026', 'Crew of 3'],
        guide: 'gecko',
      }),
      ['gecko'],
      loadPublicAsset,
    );
    expectCardSize(png);
    await expectGolden('plan', png);
  });

  it('draws the tip card', async () => {
    const png = await renderCard(
      tipTemplate({
        eyebrow: 'Planning · 6 min read',
        title: 'How to get six friends to agree on where to go',
        byline: 'By Tokek, Bali',
        background: PALETTE.green,
        guide: 'gecko',
      }),
      ['gecko'],
      loadPublicAsset,
    );
    expectCardSize(png);
    await expectGolden('tip', png);
  });
});

describe('serving OG cards', { timeout: 60_000 }, () => {
  const previews = new Map<string, unknown>([
    [
      'BAX6XA',
      {
        kind: 'invite',
        crew_name: 'Bali Six',
        inviter_first_name: 'Winston',
        trip_place: 'Bali',
        members_count: 4,
        expires_at: null,
        state: 'active',
      },
    ],
  ]);
  const plans = new Map<string, unknown>([[PLAN_TOKEN, PLAN]]);
  let api: Server;
  let apiBaseUrl = '';

  beforeAll(async () => {
    api = createServer((request, response) => {
      const code = /^\/v1\/links\/([^/]+)\/preview/u.exec(request.url ?? '')?.[1] ?? '';
      const plan = /^\/v1\/public\/plan\/([^/]+)/u.exec(request.url ?? '')?.[1];
      const body = plan === undefined ? previews.get(code) : plans.get(plan);
      response.setHeader('content-type', 'application/json');
      response.statusCode = body === undefined ? 404 : 200;
      response.end(
        JSON.stringify(
          body ?? { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } },
        ),
      );
    });
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
    apiBaseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => api.close(() => resolve())));

  function serve(
    kind: string,
    id: string,
    bucket: MemoryBucket,
    base = apiBaseUrl,
  ): Promise<Response> {
    return serveOg({
      kind,
      id,
      request: new Request(`https://critterpass.app/og/${kind}/${id}.png`),
      apiBaseUrl: base,
      proxySecret: undefined,
      env: { OG_CACHE: bucket, OG_CACHE_SECRET: 'test-secret' },
      loadAsset: loadPublicAsset,
      words: WORDS,
    });
  }

  it('draws once, then serves the cached card', async () => {
    const bucket = new MemoryBucket();
    const first = await serve('invite', 'BAX6XA', bucket);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-og-cache')).toBe('miss');
    expect(first.headers.get('cache-control')).toBe('no-store');
    const second = await serve('invite', 'BAX6XA', bucket);
    expect(second.headers.get('x-og-cache')).toBe('hit');
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(
      new Uint8Array(await first.arrayBuffer()),
    );
  });

  it('a switched-off code answers 404 and its cached card is deleted', async () => {
    const bucket = new MemoryBucket();
    await serve('invite', 'BAX6XA', bucket);
    const key = await ogCacheKey('test-secret', 'invite', 'BAX6XA', OG_TEMPLATE_VERSION);
    expect(bucket.objects.has(key)).toBe(true);
    previews.set('BAX6XA', { ...(previews.get('BAX6XA') as object), state: 'revoked' });
    const response = await serve('invite', 'BAX6XA', bucket);
    expect(response.status).toBe(404);
    expect(bucket.objects.has(key)).toBe(false);
  });

  it('draws a published plan by its link token, and forgets it once the plan is taken down', async () => {
    const bucket = new MemoryBucket();
    const first = await serve('plan', PLAN_TOKEN, bucket);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-og-cache')).toBe('miss');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect((await serve('plan', PLAN_TOKEN, bucket)).headers.get('x-og-cache')).toBe('hit');
    const key = await ogCacheKey('test-secret', 'plan', PLAN_TOKEN, OG_TEMPLATE_VERSION);
    expect(bucket.objects.has(key)).toBe(true);
    plans.delete(PLAN_TOKEN);
    expect((await serve('plan', PLAN_TOKEN, bucket)).status).toBe(404);
    expect(bucket.objects.has(key)).toBe(false);
    // The plan's own id is never a key.
    expect((await serve('plan', PLAN.shared_plan_id, bucket)).status).toBe(404);
  });

  it('never resolves an internal id, a non-canonical code or an unknown kind', async () => {
    const bucket = new MemoryBucket();
    expect((await serve('invite', '0190a6f1-7aaa-7bbb-8ccc-123456789abc', bucket)).status).toBe(
      404,
    );
    expect((await serve('invite', 'bax6xa', bucket)).status).toBe(404);
    expect((await serve('crew', 'BAX6XA', bucket)).status).toBe(404);
    expect(bucket.objects.size).toBe(0);
  });

  it('falls back to the site card when the api is down', async () => {
    const response = await serve('invite', 'BAX6XA', new MemoryBucket(), 'http://127.0.0.1:9');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-og-cache')).toBe('fallback');
  });
});
