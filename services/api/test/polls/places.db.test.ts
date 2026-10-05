/**
 * Place search and the guest guide over the real stack, on the real place index (61 places, 150
 * cities): every destination is found by its own name and every place by its country name,
 * "marakech" finds Marrakech, no local's name ever appears in an answer; the guest brief streams
 * the page chips and locals first, then facts cited only from allow-listed pages (recorded Tavily
 * and DeepSeek), cached per crew-size bucket, hidden by its kill switch.
 */
import { createGateway, createTavilySearch, GUEST_BRIEF_DOMAINS } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerGuestBriefRoutes } from '../../src/routes/guest-brief';
import { registerPlaceSearchRoutes, type PlaceSearchRow } from '../../src/routes/places-search';
import type { CommandDoorsHarness } from '../routes/command-doors-harness';
import { PLACE_CRITTERS, PLACE_SETS, seedPlaceIndex } from './place-index-fixture';
import { buildPollCrew, startPollDoors, type PollCrew } from './poll-fixture';

let harness: CommandDoorsHarness;
let crew: PollCrew;
let deepseek: FixtureTransport = fixtureTransport([]);
let tavily: FixtureTransport = fixtureTransport([], { dir: 'tavily' });
let briefOn = true;

beforeAll(async () => {
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: (...args) => deepseek.fetch(...args),
    maxAttempts: 1,
  });
  const search = createTavilySearch({
    apiKey: 'fixture-key',
    fetch: (...args) => tavily.fetch(...args),
  });
  harness = await startPollDoors(undefined, (app, deps) => {
    // The enumeration below searches ~250 times in a minute; the budget is not what it tests.
    registerPlaceSearchRoutes(app, { ...deps, rateLimit: { windowSeconds: 60, max: 10_000 } });
    registerGuestBriefRoutes(app, {
      ...deps,
      cache: {
        get: (key) => harness.redis.get(key),
        set: (key, value, options) => harness.redis.set(key, value, options),
      },
      gateway,
      search,
      isOn: () => Promise.resolve(briefOn),
    });
  });
  crew = await buildPollCrew(harness, 4);
  await seedPlaceIndex(harness.pool, crew.organiser.uid);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function search(q: string): Promise<PlaceSearchRow[]> {
  const response = await harness.request(`/v1/places?q=${encodeURIComponent(q)}&limit=30`, {
    headers: { cookie: crew.organiser.cookie },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { results: PlaceSearchRow[] }).results;
}

describe('GET /v1/places', { timeout: 120_000 }, () => {
  it('finds every destination by its own name', async () => {
    const { rows } = await harness.pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM destinations',
    );
    expect(rows.length).toBeGreaterThanOrEqual(150);
    const missing: string[] = [];
    for (const row of rows) {
      if (!(await search(row.name)).some((result) => result.place_id === row.id))
        missing.push(row.name);
    }
    expect(missing).toEqual([]);
  });

  it('finds every place by its country name', async () => {
    const missing: string[] = [];
    for (const set of PLACE_SETS) {
      if (!(await search(set.name)).some((result) => result.country === set.name))
        missing.push(set.name);
    }
    expect(missing).toEqual([]);
  });

  it('tolerates typos and accents, and routes live cities to their guide', async () => {
    expect((await search('marakech'))[0]).toMatchObject({
      name: 'Marrakech',
      coverage: 'guest',
      guide: 'tokek',
    });
    expect((await search('reykjavik'))[0]).toMatchObject({
      name: 'Reykjavík',
      coverage: 'live',
      guide: 'lundi',
    });
    expect((await search('kyoto'))[0]).toMatchObject({
      name: 'Kyoto',
      coverage: 'live',
      guide: 'pon',
    });
  });

  it('leaves far look-alikes out when a name is typed in full', async () => {
    const names = (await search('Da Lat')).map((row) => row.name);
    expect(names[0]).toBe('Đà Lạt');
    expect(names).not.toContain('Lake District');
  });

  it("routes a city to its own critter's guide only while guides go by city", async () => {
    const setPerCity = (on: boolean) =>
      harness.pool.query(
        `INSERT INTO ops.ops_config (key, value) VALUES ('guides.per_city', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(on)],
      );
    const vietnam = PLACE_SETS.find((set) => set.code === 'vn')!;
    const asToday = vietnam.coverage === 'live' ? (vietnam.guide ?? 'tokek') : 'tokek';
    await harness.pool.query(
      `INSERT INTO guides (slug, name, colour, accent, critter_key)
       VALUES ('ngua', 'Ngựa', 'pink', '#ff8fbf', 'cp-006')`,
    );
    expect((await search('da lat'))[0]).toMatchObject({ name: 'Đà Lạt', guide: asToday });
    const kyoto = (await search('kyoto'))[0];

    await setPerCity(true);
    expect((await search('da lat'))[0]).toMatchObject({ name: 'Đà Lạt', guide: 'ngua' });
    // A destination whose critter has no guide row answers as before.
    expect((await search('kyoto'))[0]).toEqual(kyoto);
    await setPerCity(false);
    expect((await search('da lat'))[0]).toMatchObject({ name: 'Đà Lạt', guide: asToday });
  });

  it('shows locals as silhouettes and never names them', async () => {
    const [marrakech] = await search('Marrakech');
    expect(marrakech?.locals).toEqual(['cp-097']);
    const names = PLACE_CRITTERS.map((critter) => critter.name).filter((name) => name.length >= 4);
    const bodies = JSON.stringify([
      await search('Morocco'),
      await search('Japan'),
      await search('Vietnam'),
    ]);
    expect(names.filter((name) => bodies.includes(name))).toEqual([]);
  });
});

interface Frame {
  readonly type: string;
  readonly [field: string]: unknown;
}

async function brief(placeId: string, body: Record<string, unknown>): Promise<Frame[]> {
  const response = await harness.request(`/v1/places/${placeId}/guest-brief`, {
    method: 'POST',
    headers: { cookie: crew.organiser.cookie },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return (await response.text()).split('\n\n').flatMap((block) => {
    const type = /^event: (.*)$/mu.exec(block)?.[1];
    const data = /^data: (.*)$/mu.exec(block)?.[1];
    return type === undefined || data === undefined
      ? []
      : [{ type, ...(JSON.parse(data) as object) }];
  });
}

describe('POST /v1/places/{id}/guest-brief', () => {
  let marrakech: string;

  beforeAll(async () => {
    marrakech = (await search('Marrakech'))[0]!.place_id;
  });

  it('streams the page, then facts cited from allow-listed pages, then done', async () => {
    deepseek = fixtureTransport(['guest-01']);
    tavily = fixtureTransport(['guest-01-search-1', 'guest-01-search-2', 'guest-01-search-3'], {
      dir: 'tavily',
    });
    const frames = await brief(marrakech, { crew_id: crew.crewId });
    expect(frames[0]).toMatchObject({
      type: 'place',
      name: 'Marrakech',
      country: 'Morocco',
      currency: 'MAD',
    });
    expect(
      (frames[0]?.['locals'] as { id: string; hint: string }[]).map((local) => local.id),
    ).toEqual(['cp-097', 'cp-098', 'cp-099']);
    const facts = frames.filter((frame) => frame.type === 'fact');
    expect(facts.length).toBeGreaterThanOrEqual(3);
    for (const fact of facts) {
      expect(GUEST_BRIEF_DOMAINS as readonly string[]).toContain(fact['domain']);
      expect(String(fact['text']).length).toBeLessThanOrEqual(90);
    }
    expect(frames.at(-1)).toMatchObject({ type: 'done', cached: false, ai_generated: true });
    const searches = tavily.requests.map((request) => request['include_domains']);
    expect(searches.every((domains) => Array.isArray(domains) && domains.length > 0)).toBe(true);
  });

  it('replays from the cache for the same crew-size bucket', async () => {
    deepseek = fixtureTransport([]);
    tavily = fixtureTransport([], { dir: 'tavily' });
    const frames = await brief(marrakech, { crew_id: crew.crewId });
    expect(frames.at(-1)).toMatchObject({ type: 'done', cached: true });
    expect(deepseek.requests).toHaveLength(0);
  });

  it('hides the facts when switched off and keeps the page', async () => {
    briefOn = false;
    const frames = await brief(marrakech, {});
    briefOn = true;
    expect(frames.map((frame) => frame.type)).toEqual(['place', 'done']);
    expect(frames[1]).toMatchObject({ hidden: true });
  });
});
