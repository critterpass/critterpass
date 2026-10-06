/**
 * A destination's links run and a home link run on a migrated Postgres, with the network replayed
 * at its edge: one SearXNG answer per search, the cited pages as excerpts saved on 6 Oct 2026, and
 * live recordings of DeepSeek's writes. Cusco gains its day trip to Machu Picchu as a new area
 * with the sentence that times it; Đà Nẵng's day trip lands on the Hội An row we have, a sight
 * inside the city is not a day trip, and an editor's link is never replaced. Fresh links, an area
 * and a spent cap call nothing. The way from Ho Chi Minh City is stored once for the pair of
 * places.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runDestinationLinks } from '../../../src/places/profile/brief-links';
import { briefSpentTodayMicros } from '../../../src/places/profile/brief-store';
import { runHomeLink } from '../../../src/places/profile/home-link';
import { createPlaceSearch } from '../../../src/places/profile/search';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const file = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const SEARX = 'http://searxng.test:8080';

interface Scenario {
  readonly searx: string;
  readonly write: string;
  readonly pages: Readonly<Record<string, string>>;
}

const CUSCO: Scenario = {
  searx: 'searx-links-cusco',
  write: 'deepseek-links-cusco',
  pages: {
    'https://www.salkantaytrekking.com/blog/machu-picchu-the-easy-way': 'page-links-cusco-1.html',
    'https://gallivantinglaura.com/best-day-trips-from-cusco-peru': 'page-links-cusco-2.html',
  },
};
const DA_NANG: Scenario = {
  searx: 'searx-links-da-nang',
  write: 'deepseek-links-da-nang',
  pages: {
    'https://dacotours.com/best-8-day-trips-from-da-nang-vietnam-by-locals':
      'page-links-da-nang-1.html',
    'https://www.findawayabroad.com/post/day-trips-from-da-nang': 'page-links-da-nang-2.html',
  },
};
const FROM_SAIGON: Scenario = {
  searx: 'searx-home-link',
  write: 'deepseek-home-link',
  pages: { 'https://www.baolau.com/en/s/ho-chi-minh/da-nang': 'page-home-link-sgn-da-nang.html' },
};

let harness: JobsHarness;
const ids: Record<string, string> = {};

function network(scenario: Scenario) {
  const calls: string[] = [];
  const json = (name: string) => {
    const { status, body } = (
      JSON.parse(file(`${name}.json`)) as { response: { status: number; body: unknown } }
    ).response;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const send = (input: unknown): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.startsWith(`${SEARX}/search`)) return Promise.resolve(json(scenario.searx));
    const page = scenario.pages[url];
    if (page !== undefined) {
      return Promise.resolve(
        new Response(file(page), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      );
    }
    if (url.includes('deepseek.com')) return Promise.resolve(json(scenario.write));
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetch: send as typeof fetch, calls };
}

function deps(net: ReturnType<typeof network>, capMicros = 1_000_000) {
  return {
    gateway: createGateway({ apiKey: 'fixture-key', fetch: net.fetch, maxAttempts: 1 }),
    search: createPlaceSearch({
      searxUrl: SEARX,
      engines: ['bing', 'mojeek'],
      gapMs: 0,
      pool: harness.pool,
      fetch: net.fetch,
    }),
    dailyCapMicros: capMicros,
    fetch: net.fetch,
  };
}

const modelCalls = (net: ReturnType<typeof network>) =>
  net.calls.filter((url) => url.includes('deepseek.com'));

interface LinkRow {
  key: string;
  to_slug: string;
  to_coverage: string;
  kind: string;
  minutes: number;
  mode: string;
  day_length: string | null;
  essential: boolean | null;
  cost_pp_minor: string | null;
  cost_currency: string | null;
  note: string | null;
  i18n: Record<string, { note: string }> | null;
  origin: string;
  sources: { url: string; title: string; quote: string }[];
}

async function linksFrom(slug: string): Promise<LinkRow[]> {
  const { rows } = await harness.pool.query<LinkRow>(
    `SELECT l.key, t.slug AS to_slug, t.coverage AS to_coverage, l.kind, l.minutes, l.mode,
            l.day_length, l.essential, l.cost_pp_minor::text, l.cost_currency, l.note, l.i18n,
            l.origin, l.sources
       FROM destination_links l
       JOIN destinations f ON f.id = l.from_destination_id
       JOIN destinations t ON t.id = l.to_destination_id
      WHERE f.slug = $1 ORDER BY l.position, l.key`,
    [slug],
  );
  return rows;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  const one = async (sql: string, params: unknown[] = []) =>
    (await harness.pool.query<{ id: string }>(sql, params)).rows[0]?.id as string;
  const editor = await one(
    "INSERT INTO users (id, status) VALUES ($1, 'registered') RETURNING id",
    [randomUUID()],
  );
  const release = await one(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, approved_by, approved_at, published_at)
     VALUES ('sets', 1, 'links-test', 'Test', 'published', 'publish', repeat('0', 64), '{}', 0, $1,
       now(), now())
     RETURNING id`,
    [editor],
  );
  for (const [code, slug, name, country, iso, tz, currency] of [
    ['pe', 'cusco', 'Cusco', 'Peru', 'PE', 'America/Lima', 'PEN'],
    ['vn', 'da-nang', 'Đà Nẵng', 'Vietnam', 'VN', 'Asia/Ho_Chi_Minh', 'VND'],
  ] as const) {
    ids[slug] = await one(
      `INSERT INTO destinations (slug, name, country, coverage, tz, currency)
       VALUES ($1, $2, $3, 'live', $4, $5) RETURNING id`,
      [slug, name, country, tz, currency],
    );
    const set = await one(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, destination_id, release_id)
       VALUES ($1, $2, $3, 1, $4, $5, '{en}', 'live', 'cp-001', '[]', $6, $7) RETURNING id`,
      [code, country, iso, tz, currency, ids[slug], release],
    );
    await harness.pool.query('UPDATE destinations SET critter_set_id = $2 WHERE id = $1', [
      ids[slug],
      set,
    ]);
    ids[`${code}-set`] = set;
  }
  // The city next door is a destination of its own; the mountains are a sight inside Đà Nẵng.
  ids['vn-hoi-an'] = await one(
    `INSERT INTO destinations (slug, name, country, coverage, tz, currency, critter_set_id)
     VALUES ('vn-hoi-an', 'Hội An', 'Vietnam', 'guest', 'Asia/Ho_Chi_Minh', 'VND', $1)
     RETURNING id`,
    [ids['vn-set']],
  );
  await harness.pool.query(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, status)
     VALUES ($1, 'Marble Mountains', 'Ngũ Hành Sơn', 'nature', 16.004, 108.263, 'active')`,
    [ids['da-nang']],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('a destination’s links from cited pages', { timeout: 60_000 }, () => {
  it('writes Cusco to Machu Picchu as a day trip to a new area, with the sentence that times it', async () => {
    const net = network(CUSCO);
    const report = await runDestinationLinks(harness.pool, deps(net), {
      destinationId: ids['cusco'] as string,
    });
    expect(report).toMatchObject({ outcome: 'ready', links: 2 });
    expect(modelCalls(net)).toHaveLength(1);

    const links = await linksFrom('cusco');
    expect(links.map((l) => l.key)).toEqual([
      'cusco>pe-machu-picchu:day_trip',
      'cusco>pe-pisac:day_trip',
    ]);
    expect(links[0]).toMatchObject({
      to_slug: 'pe-machu-picchu',
      to_coverage: 'area',
      kind: 'day_trip',
      minutes: 240,
      mode: 'train',
      day_length: 'full',
      essential: true,
      origin: 'ai',
      sources: [
        {
          url: 'https://www.salkantaytrekking.com/blog/machu-picchu-the-easy-way',
          quote: 'The train journey from Cusco to Machu Picchu takes no more than 4 hours',
        },
      ],
    });
    expect(links[0]?.note).toBeTruthy();
    // The area is reached from Cusco and carries its set, time zone and currency.
    const { rows: areas } = await harness.pool.query(
      `SELECT name, country, coverage, tz, currency, critter_set_id FROM destinations
        WHERE slug = 'pe-machu-picchu'`,
    );
    expect(areas).toEqual([
      {
        name: 'Machu Picchu',
        country: 'Peru',
        coverage: 'area',
        tz: 'America/Lima',
        currency: 'PEN',
        critter_set_id: ids['pe-set'],
      },
    ]);
    const { rows: runs } = await harness.pool.query<{
      status: string;
      links: number;
      days: number;
    }>(
      `SELECT status, links, round(extract(epoch FROM expires_at - checked_at) / 86400)::int AS days
         FROM destination_link_runs WHERE destination_id = $1`,
      [ids['cusco']],
    );
    expect(runs).toEqual([{ status: 'ready', links: 2, days: 90 }]);
    expect(await briefSpentTodayMicros(harness.pool, new Date())).toBeGreaterThan(0);
  });

  it('lands Đà Nẵng’s day trip on the Hội An row, keeps a sight inside the city out and an editor’s row as it is', async () => {
    await harness.pool.query(
      `INSERT INTO destination_links
         (key, from_destination_id, to_destination_id, kind, minutes, mode, origin)
       VALUES ('da-nang>vn-hoi-an:onward', $1, $2, 'onward', 50, 'car', 'editorial')`,
      [ids['da-nang'], ids['vn-hoi-an']],
    );
    const net = network(DA_NANG);
    const report = await runDestinationLinks(harness.pool, deps(net), {
      destinationId: ids['da-nang'] as string,
    });
    expect(report).toMatchObject({ outcome: 'ready', links: 2 });

    const links = await linksFrom('da-nang');
    const hoiAn = links.find((l) => l.key === 'da-nang>vn-hoi-an:day_trip');
    expect(hoiAn).toMatchObject({
      to_slug: 'vn-hoi-an',
      to_coverage: 'guest',
      minutes: 45,
      mode: 'car',
      day_length: 'full',
      cost_pp_minor: '1500',
      cost_currency: 'USD',
      origin: 'ai',
    });
    expect(hoiAn?.sources.map((s) => s.url)).toEqual([
      'https://dacotours.com/best-8-day-trips-from-da-nang-vietnam-by-locals',
      'https://dacotours.com/best-8-day-trips-from-da-nang-vietnam-by-locals',
    ]);
    expect(hoiAn?.sources[0]?.quote).toBe('About 45 minutes from Da Nang.');
    expect(hoiAn?.i18n?.['vi']?.note).toBeTruthy();
    expect(links.map((l) => [l.key, l.origin]).sort()).toEqual([
      ['da-nang>vn-an-bang-beach:day_trip', 'ai'],
      ['da-nang>vn-hoi-an:day_trip', 'ai'],
      ['da-nang>vn-hoi-an:onward', 'editorial'],
    ]);
    expect(links.find((l) => l.kind === 'onward')).toMatchObject({ minutes: 50, sources: [] });
    const { rows } = await harness.pool.query<{ dropped: { name: string; reason: string }[] }>(
      'SELECT dropped FROM destination_link_runs WHERE destination_id = $1',
      [ids['da-nang']],
    );
    expect(rows[0]?.dropped).toContainEqual({
      section: 'links',
      name: 'Marble Mountains (day_trip)',
      reason: 'inside_destination',
    });
  });

  it('calls nothing for fresh links, an area or a spent cap', async () => {
    const net = network(CUSCO);
    const run = (id: string | undefined, force = false, cap?: number) =>
      runDestinationLinks(harness.pool, deps(net, cap), { destinationId: id as string, force });
    expect(await run(ids['cusco'])).toEqual({ outcome: 'skipped', reason: 'exists' });
    expect(await run(ids['cusco'], true, 0)).toEqual({ outcome: 'skipped', reason: 'daily_cap' });
    const { rows } = await harness.pool.query<{ id: string }>(
      "SELECT id FROM destinations WHERE slug = 'pe-machu-picchu'",
    );
    expect(await run(rows[0]?.id, true)).toEqual({ outcome: 'skipped', reason: 'area' });
    expect(net.calls).toEqual([]);
  });
});

describe('getting to a destination from a home city', { timeout: 60_000 }, () => {
  it('stores the cited ways once for the pair of places, and calls nothing while they are fresh', async () => {
    const net = network(FROM_SAIGON);
    const input = { destinationId: ids['da-nang'] as string, origin: 'SGN' };
    const report = await runHomeLink(harness.pool, deps(net), input);
    expect(report).toMatchObject({ outcome: 'ready', ways: 2, dropped: 1 });
    // The searches name the two places and nothing else.
    const searches = net.calls
      .filter((url) => url.startsWith(SEARX))
      .map((url) => new URL(url).searchParams.get('q') ?? '');
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((q) => q.includes('Ho Chi Minh City') && q.includes('Đà Nẵng'))).toBe(
      true,
    );

    const { rows } = await harness.pool.query<{
      origin_key: string;
      origin_name: string;
      status: string;
      ways: {
        mode: string;
        minutes: number;
        cost_pp_minor: number | null;
        cost_currency: string | null;
        sources: { url: string; quote: string }[];
      }[];
      days: number;
    }>(
      `SELECT origin_key, origin_name, status, ways,
              round(extract(epoch FROM expires_at - generated_at) / 86400)::int AS days
         FROM destination_home_links WHERE destination_id = $1`,
      [ids['da-nang']],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origin_key: 'SGN',
      origin_name: 'Ho Chi Minh City',
      status: 'ready',
      days: 30,
    });
    expect(rows[0]?.ways.map((w) => [w.mode, w.minutes, w.cost_pp_minor, w.cost_currency])).toEqual(
      [
        ['flight', 80, 653061, 'VND'],
        ['bus', 1405, 560000, 'VND'],
      ],
    );
    for (const way of rows[0]?.ways ?? []) {
      expect(way.sources[0]?.url).toBe('https://www.baolau.com/en/s/ho-chi-minh/da-nang');
      expect(way.sources[0]?.quote.length).toBeGreaterThan(8);
    }

    const again = network(FROM_SAIGON);
    expect(await runHomeLink(harness.pool, deps(again), input)).toEqual({
      outcome: 'skipped',
      reason: 'exists',
    });
    expect(await runHomeLink(harness.pool, deps(again, 0), { ...input, force: true })).toEqual({
      outcome: 'skipped',
      reason: 'daily_cap',
    });
    expect(await runHomeLink(harness.pool, deps(again), { ...input, origin: 'ZZZ' })).toEqual({
      outcome: 'skipped',
      reason: 'unknown_origin',
    });
    expect(again.calls).toEqual([]);
  });
});
