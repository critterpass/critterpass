/**
 * One place's profile run on a migrated Postgres, with the network replayed at its edge: SearXNG
 * answers and two pages shaped from the pipeline's run of 6 Oct 2026, and live recordings of
 * DeepSeek (the write, its web-search second source, the French translation) and Jev for Bảo Đại
 * Summer Palace in Đà Lạt. The run saves a checked, cited profile in English and Vietnamese with
 * Jev's labels and a stored photo; a second run, a reviewed place and a spent cap call nothing.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway, translatePlaceProfile } from '@cp/ai';
import { withSystem } from '@cp/db';
import { PLACES_QUEUES, type PlaceProfileText } from '@cp/domain';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runPlaceProfile, type PlaceProfileDeps } from '../../../src/places/profile/run';
import { createPlaceSearch } from '../../../src/places/profile/search';
import { saveProfileTranslation } from '../../../src/places/profile/store';
import { queueWarmProfiles } from '../../../src/places/profile/warm';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const file = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const recorded = (name: string) =>
  (JSON.parse(file(`${name}.json`)) as { response: { status: number; body: unknown } }).response;

const SEARX = 'http://searxng.test:8080';
const IMAGE = 'https://vinwonders.com/images/dinh-3.jpg';

let harness: JobsHarness;
let photo: Buffer;
let palace: string;
let reviewed: string;
let destinationId: string;

function network() {
  const calls: string[] = [];
  const json = (name: string) => {
    const { status, body } = recorded(name);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const send = (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    const body = typeof init?.body === 'string' ? init.body : '';
    if (url.startsWith(`${SEARX}/search`)) {
      const params = new URL(url).searchParams;
      if (params.get('categories') === 'images') return Promise.resolve(json('searx-images'));
      return Promise.resolve(
        json(params.get('language') === 'vi' ? 'searx-web-vi' : 'searx-web-en'),
      );
    }
    const html = (name: string) =>
      new Response(file(name), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.startsWith('https://agotourist.com/'))
      return Promise.resolve(html('page-agotourist.html'));
    if (url.startsWith('https://viet-go.com/')) return Promise.resolve(html('page-viet-go.html'));
    if (url === IMAGE) {
      return Promise.resolve(
        new Response(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg' } }),
      );
    }
    if (url.includes('typesafe.ai')) return Promise.resolve(json('jev-place-labels'));
    if (url.includes('deepseek.com')) {
      if (body.includes('"web_search_20250305"'))
        return Promise.resolve(json('deepseek-profile-check'));
      if (body.includes('You translate the short page')) {
        return Promise.resolve(json('deepseek-profile-translate-fr'));
      }
      return Promise.resolve(json('deepseek-profile-write'));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetch: send as typeof fetch, calls };
}

function deps(net: ReturnType<typeof network>, overrides: Partial<PlaceProfileDeps> = {}) {
  const puts: { key: string; bytes: number; type: string }[] = [];
  const gateway = createGateway({ apiKey: 'fixture-key', fetch: net.fetch, maxAttempts: 1 });
  const value: PlaceProfileDeps = {
    gateway,
    decisions: createDecisionClient({ apiKey: 'fixture-key', fetch: net.fetch, gateway }),
    search: createPlaceSearch({
      searxUrl: SEARX,
      engines: ['bing', 'mojeek', 'startpage'],
      gapMs: 0,
      pool: harness.pool,
      fetch: net.fetch,
    }),
    store: {
      put: (key, bytes, type) => {
        puts.push({ key, bytes: bytes.byteLength, type });
        return Promise.resolve();
      },
    },
    tier: 'fast',
    dailyCapMicros: 1_000_000,
    fetch: net.fetch,
    ...overrides,
  };
  return { value, puts, gateway };
}

async function place(name: string, nameLocal: string | null, editorial: object = {}) {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address, editorial)
     VALUES ($1, $2, $3, 'museum', 11.93, 108.43, '1 Triệu Việt Vương, Đà Lạt', $4) RETURNING id`,
    [destinationId, name, nameLocal, JSON.stringify(editorial)],
  );
  return rows[0]?.id as string;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 120, b: 80 } },
  })
    .jpeg()
    .toBuffer();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]?.id as string;
  palace = await place('Bảo Đại Summer Palace (Dinh III)', 'Dinh Bảo Đại III');
  reviewed = await place('Crazy House', 'Biệt thự Hằng Nga', { why_go: 'A reviewed line.' });
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

const row = (poiId: string) =>
  withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<Record<string, unknown>>(
      'SELECT * FROM place_profiles WHERE poi_id = $1',
      [poiId],
    );
    return rows[0];
  });

describe('places.profile for one place', { timeout: 60_000 }, () => {
  it('saves a cited profile in English and Vietnamese with labels and a photo', async () => {
    const net = network();
    const { value, puts } = deps(net);
    const report = await runPlaceProfile(harness.pool, value, { poiId: palace });
    expect(report).toMatchObject({
      outcome: 'ready',
      facts: 3,
      dropped: 1,
      photos: 1,
      secondSource: true,
    });

    const saved = await row(palace);
    expect(saved).toMatchObject({
      status: 'ready',
      category: 'museum',
      meal_role: 'none',
      best_times: ['early_morning', 'morning', 'afternoon', 'sunset'],
      visit_min: 60,
      model: 'deepseek-flash',
    });
    const texts = saved?.['texts'] as Record<string, { why_go: string; facts: string[] }>;
    expect(Object.keys(texts).sort()).toEqual(['en', 'vi']);
    expect(texts['vi']?.facts).toHaveLength(3);
    // The fee: on our page, but DeepSeek's own search said 30,000 VND, so it is dropped.
    expect(saved?.['dropped_facts']).toEqual([
      expect.objectContaining({ kind: 'entry', reason: 'no_second_source' }),
    ]);
    expect(
      (saved?.['facts'] as { kind: string; second_source: string }[]).map((f) => [
        f.kind,
        f.second_source,
      ]),
    ).toEqual([
      ['hours', 'agrees'],
      ['dress', 'n/a'],
      ['know', 'n/a'],
    ]);
    // Supplier and social results never reach the sources; our two pages lead.
    const sources = (saved?.['sources'] as { url: string }[]).map((s) => s.url);
    expect(sources.slice(0, 2)).toEqual([
      'https://agotourist.com/dinh-bao-dai-da-lat-dinh-iii/',
      'https://viet-go.com/en/attractions/bao-dai-summer-palace',
    ]);
    expect(sources.some((u) => /facebook|tripadvisor/u.test(u))).toBe(false);
    // The pinterest image is skipped; the other is resized and stored under the public prefix.
    expect(puts.map((p) => [p.key, p.type])).toEqual([
      [`c/place-profiles/${palace}/1.jpg`, 'image/jpeg'],
    ]);
    expect(puts[0]?.bytes).toBeGreaterThan(0);
    expect(saved?.['photos']).toEqual([
      expect.objectContaining({ key: `c/place-profiles/${palace}/1.jpg`, width: 480, height: 320 }),
    ]);
    expect(Number(saved?.['cost_micros'])).toBeGreaterThan(0);
    expect(net.calls.some((u) => u.includes('pinimg'))).toBe(false);
  });

  it('calls nothing for a place that has a profile, unless forced past a spent cap', async () => {
    const net = network();
    expect(await runPlaceProfile(harness.pool, deps(net).value, { poiId: palace })).toEqual({
      outcome: 'skipped',
      reason: 'exists',
    });
    const capped = deps(net, { dailyCapMicros: 1 }).value;
    expect(await runPlaceProfile(harness.pool, capped, { poiId: palace, force: true })).toEqual({
      outcome: 'skipped',
      reason: 'daily_cap',
    });
    expect(await runPlaceProfile(harness.pool, deps(net).value, { poiId: reviewed })).toEqual({
      outcome: 'skipped',
      reason: 'reviewed',
    });
    expect(net.calls).toEqual([]);
    expect(await row(reviewed)).toBeUndefined();
  });

  it("adds a reader's language once, keeping every number", async () => {
    const net = network();
    const { gateway } = deps(net);
    const texts = (await row(palace))?.['texts'] as Record<string, PlaceProfileText>;
    const english = texts['en'];
    if (english === undefined) throw new Error('no English text');
    const fr = await translatePlaceProfile(gateway, english, 'fr');
    expect(fr.text.facts[0]).toContain('07:00 – 17:30');
    expect(await saveProfileTranslation(harness.pool, palace, 'fr', fr.text, fr.costMicros)).toBe(
      true,
    );
    expect(await saveProfileTranslation(harness.pool, palace, 'fr', fr.text, 0)).toBe(false);
    const saved = (await row(palace))?.['texts'] as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(['en', 'fr', 'vi']);
  });
});

describe('warming a destination', () => {
  it('queues its top places without a profile or a note, spread out, once', async () => {
    const boss = await harness.startRuntime([]);
    await boss.createQueue(PLACES_QUEUES.profile, { policy: 'stately' });
    const market = await place('Đà Lạt Market', 'Chợ Đà Lạt', { essential: true });
    await harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Bus stop', 'transit', 11.9, 108.4)`,
      [destinationId],
    );
    const options = { limit: 30, priority: -10, spacingSeconds: 60 };
    expect(await queueWarmProfiles(harness.pool, boss, destinationId, options)).toBe(1);
    expect(await queueWarmProfiles(harness.pool, boss, destinationId, options)).toBe(0);
    const { rows } = await harness.pool.query<{ poi: string; priority: number }>(
      `SELECT data->>'poi_id' AS poi, priority FROM pgboss.job WHERE name = $1`,
      [PLACES_QUEUES.profile],
    );
    expect(rows).toEqual([{ poi: market, priority: -10 }]);
  });
});
