/**
 * One destination brief run on a migrated Postgres, with the network replayed at its edge: one
 * SearXNG answer for every search, Wikivoyage's Đà Lạt guide and vietnamtourism.com's stay guide
 * as fetched on 6 Oct 2026, and live recordings of DeepSeek's brief and Jev's tiebreak for the
 * one close call. The names land on our own rows (a name no row carries is dropped), lead the
 * destination's picks with the open-data fill behind them, and the cited stay bands become
 * unreviewed web estimates; a fresh brief, a curated destination and a spent cap call nothing.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  runDestinationBrief,
  type DestinationBriefDeps,
} from '../../../src/places/profile/brief-run';
import { createPlaceSearch } from '../../../src/places/profile/search';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';
import { picksOf, seedDaLat, type DaLat } from '../pick/da-lat-places';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const file = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const SEARX = 'http://searxng.test:8080';
const PAGES: Readonly<Record<string, string>> = {
  'https://en.wikivoyage.org/wiki/Da_Lat': 'page-brief-wikivoyage-see.html',
  'https://en.wikivoyage.org/wiki/Da_Lat#Eat': 'page-brief-wikivoyage-eat.html',
  'https://www.vietnamtourism.com/en/where-to-stay-in-da-lat-neighborhoods-and-hotel-picks-by-budget':
    'page-brief-stays.html',
};

let harness: JobsHarness;
let daLat: DaLat;

function network() {
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
    if (url.startsWith(`${SEARX}/search`)) return Promise.resolve(json('searx-brief-web'));
    const page = PAGES[url];
    if (page !== undefined) {
      return Promise.resolve(
        new Response(file(page), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      );
    }
    if (url.includes('typesafe.ai')) return Promise.resolve(json('jev-brief-tiebreak'));
    if (url.includes('deepseek.com')) return Promise.resolve(json('deepseek-brief-write'));
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetch: send as typeof fetch, calls };
}

function deps(net: ReturnType<typeof network>, capMicros = 1_000_000): DestinationBriefDeps {
  const gateway = createGateway({ apiKey: 'fixture-key', fetch: net.fetch, maxAttempts: 1 });
  return {
    gateway,
    decisions: createDecisionClient({ apiKey: 'fixture-key', fetch: net.fetch, gateway }),
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
  net.calls.filter((url) => url.includes('deepseek.com') || url.includes('typesafe.ai'));

beforeAll(async () => {
  harness = await startJobsHarness();
  daLat = await seedDaLat(harness.pool, 'brief');
  // A reviewed hotel estimate a run must never replace.
  await harness.pool.query(
    `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
       nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
       reviewed_at)
     VALUES ($1, 'hotel', 1000, 2500, 1500, 1500, 'USD', 'CritterPass editorial estimate',
             '2026-10-05', now())`,
    [daLat.destinationId],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe(
  'places.destination_brief for a destination without a curated set',
  { timeout: 60_000 },
  () => {
    it('stores cited essentials on our rows, leads the picks with them and estimates the stays', async () => {
      const net = network();
      const report = await runDestinationBrief(harness.pool, deps(net), {
        destinationId: daLat.destinationId,
      });
      expect(report).toMatchObject({ outcome: 'ready', stays: 2 });

      const { rows } = await harness.pool.query<{
        status: string;
        origin: string;
        essentials: {
          poi_id: string;
          rank: number;
          why: Record<string, string>;
          sources: { url: string; quote: string }[];
        }[];
        eateries: { poi_id: string }[];
        stays: { tier: string; low: number; high: number; currency: string }[];
        days: number;
      }>(
        `SELECT status, origin, essentials, eateries, stays,
              round(extract(epoch FROM expires_at - generated_at) / 86400)::int AS days
         FROM destination_briefs WHERE destination_id = $1`,
        [daLat.destinationId],
      );
      const brief = rows[0];
      expect(brief).toMatchObject({ status: 'ready', origin: 'ai', days: 90 });
      const names = new Map(
        (
          await harness.pool.query<{ id: string; name: string }>(
            'SELECT id, name FROM pois WHERE destination_id = $1',
            [daLat.destinationId],
          )
        ).rows.map((row) => [row.id, row.name]),
      );
      const essentials = (brief?.essentials ?? []).map((e) => names.get(e.poi_id));
      // Matched outright, or (the monastery) through Jev's tiebreak; names no row carries are gone.
      expect(essentials).toEqual(
        expect.arrayContaining([
          'Crazy House',
          'Hồ Xuân Hương',
          'Thiền Viện Trúc Lâm Đà Lạt',
          'Chùa Linh Phước',
          'Thung Lũng Tình Yêu',
          'Hồ Tuyền Lâm',
        ]),
      );
      expect(essentials.every((name) => name !== undefined)).toBe(true);
      expect(brief?.essentials.map((e) => e.rank)).toEqual(essentials.map((_, i) => i + 1));
      for (const essential of brief?.essentials ?? []) {
        expect(essential.why.en ?? essential.why.vi).toBeTruthy();
        expect(essential.sources[0]?.url).toMatch(
          /^https:\/\/(en\.wikivoyage\.org|www\.vietnamtourism\.com)\//u,
        );
        expect(essential.sources[0]?.quote.length).toBeGreaterThan(8);
      }
      expect(brief?.stays.map((s) => [s.tier, s.low, s.high, s.currency])).toEqual([
        ['budget', 200000, 500000, 'VND'],
        ['mid', 500000, 1200000, 'VND'],
      ]);
      expect(modelCalls(net).filter((url) => url.includes('typesafe.ai'))).toHaveLength(1);

      // The brief's places lead the picks, in its order, and the open-data fill follows.
      const picks = await picksOf(harness.pool, daLat.destinationId);
      const leading = picks.slice(0, essentials.length);
      expect(leading.map((pick) => pick.name)).toEqual(essentials);
      expect(leading.every((pick) => pick.source === 'named')).toBe(true);
      expect(picks.some((pick) => pick.source === 'fill')).toBe(true);

      // Budget becomes a guesthouse estimate per person, unreviewed; the reviewed hotel row stays.
      const { rows: indices } = await harness.pool.query<{
        stay_type: string;
        low: string;
        high: string;
        currency: string;
        reviewed: boolean;
        source_url: string | null;
      }>(
        `SELECT stay_type, nightly_minor_low::text AS low, nightly_minor_high::text AS high, currency,
              reviewed_at IS NOT NULL AS reviewed, source_url
         FROM destination_cost_indices WHERE destination_id = $1 ORDER BY stay_type`,
        [daLat.destinationId],
      );
      expect(indices).toEqual([
        {
          stay_type: 'guesthouse',
          low: '100000',
          high: '250000',
          currency: 'VND',
          reviewed: false,
          source_url:
            'https://www.vietnamtourism.com/en/where-to-stay-in-da-lat-neighborhoods-and-hotel-picks-by-budget',
        },
        {
          stay_type: 'hotel',
          low: '1000',
          high: '2500',
          currency: 'USD',
          reviewed: true,
          source_url: null,
        },
      ]);
    });

    it('calls nothing for a fresh brief, a spent cap or a reviewed brief', async () => {
      const net = network();
      expect(
        await runDestinationBrief(harness.pool, deps(net), { destinationId: daLat.destinationId }),
      ).toEqual({ outcome: 'skipped', reason: 'exists' });
      expect(
        await runDestinationBrief(harness.pool, deps(net, 0), {
          destinationId: daLat.destinationId,
          force: true,
        }),
      ).toEqual({ outcome: 'skipped', reason: 'daily_cap' });
      const { rows } = await harness.pool.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, country) VALUES ('vn-hue-brief', 'Huế', 'Vietnam')
       RETURNING id`,
      );
      const hue = rows[0]?.id as string;
      await harness.pool.query(
        `INSERT INTO destination_briefs (destination_id, status, origin, reviewed_at)
       VALUES ($1, 'ready', 'editorial', now())`,
        [hue],
      );
      expect(
        await runDestinationBrief(harness.pool, deps(net), { destinationId: hue, force: true }),
      ).toEqual({ outcome: 'skipped', reason: 'reviewed' });
      expect(modelCalls(net)).toEqual([]);
    });
  },
);
