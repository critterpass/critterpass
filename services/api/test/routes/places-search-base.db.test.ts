/**
 * Place search over the destination base set: a base town is found by its unaccented and its
 * Vietnamese name and carries its line and photo, an exact match ranks before a base row of a
 * similar name, the `destinations.base_search` switch hides base rows, and a day-trip area stays
 * out either way.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlaceSearchRoutes, type PlaceSearchRow } from '../../src/routes/places-search';
import { buildPollCrew, startPollDoors, type PollCrew } from '../polls/poll-fixture';
import type { CommandDoorsHarness } from './command-doors-harness';

let harness: CommandDoorsHarness;
let crew: PollCrew;

beforeAll(async () => {
  harness = await startPollDoors(undefined, (app, deps) => {
    registerPlaceSearchRoutes(app, { ...deps, rateLimit: { windowSeconds: 60, max: 10_000 } });
  });
  crew = await buildPollCrew(harness, 1);
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO destinations (slug, name, country, country_code, coverage, origin, names, texts,
         critter_key, base_rank)
       VALUES
         ('vn-quy-nhon', 'Quy Nhơn', 'Vietnam', 'VN', 'guest', 'base',
          '{"en": "Qui Nhon", "vi": "Quy Nhơn"}',
          '{"en": {"line": "Coastal city in Bình Định", "about": "A city."}}', 'cp-005', 6.5),
         ('vn-quang-ngai', 'Quảng Ngãi', 'Vietnam', 'VN', 'guest', 'base', '{}', '{}', NULL, 5),
         ('lisbon-search', 'Lisbon', 'Portugal', NULL, 'live', 'seed', '{}', '{}', NULL, NULL),
         ('pt-lisbon-coast', 'Lisbon Coast', 'Portugal', 'PT', 'guest', 'base', '{}', '{}', NULL, 9),
         ('vn-quy-nhon-bay', 'Quy Nhơn Bay', 'Vietnam', 'VN', 'area', 'area', '{}', '{}', NULL, NULL)`,
    );
    await tx.query(
      `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
         author, licence, licence_url, attribution_required, credit, status, variants, blurhash)
       VALUES ('photo', 'wikimedia', 'search-1', 'https://commons.wikimedia.org/wiki/File:Q.jpg',
         'https://upload.wikimedia.org/q.jpg', ARRAY['destination:vn-quy-nhon'], 'Ann',
         'cc-by-sa-4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', true,
         'Ann · CC BY-SA 4.0 · Wikimedia Commons', 'ready',
         '[{"key": "c/media/x/640.webp", "format": "webp", "w": 640, "h": 427, "bytes": 1}]',
         'LEHV6nWB2yk8')`,
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function search(q: string): Promise<PlaceSearchRow[]> {
  const response = await harness.request(`/v1/places?q=${encodeURIComponent(q)}`, {
    headers: { cookie: crew.organiser.cookie },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { results: PlaceSearchRow[] }).results;
}

async function setBaseSearch(on: boolean): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query("UPDATE ops.ops_config SET value = $1::jsonb WHERE key = 'destinations.base_search'", [
      JSON.stringify(on),
    ]),
  );
}

describe('GET /v1/places over the base set', { timeout: 120_000 }, () => {
  it('finds a base town by its unaccented and its Vietnamese name, with its line and photo', async () => {
    for (const q of ['quy nhon', 'Quy Nhơn', 'qui nhon']) {
      const [first] = await search(q);
      expect(first, q).toMatchObject({
        name: 'Quy Nhơn',
        country: 'Vietnam',
        country_code: 'VN',
        coverage: 'guest',
        locals: ['cp-005'],
        line: 'Coastal city in Bình Định',
        photo: 'destination:vn-quy-nhon',
      });
    }
  });

  it('ranks an exact match before a base row of a similar name', async () => {
    const names = (await search('lisbon')).map((row) => row.name);
    expect(names.indexOf('Lisbon')).toBeLessThan(names.indexOf('Lisbon Coast'));
  });

  it('hides base rows while the switch is off, and never offers a day-trip area', async () => {
    await setBaseSearch(false);
    try {
      expect((await search('quy nhon')).map((row) => row.name)).toEqual([]);
      expect((await search('lisbon')).map((row) => row.name)).toEqual(['Lisbon']);
    } finally {
      await setBaseSearch(true);
    }
    expect((await search('quy nhon bay')).map((row) => row.name)).not.toContain('Quy Nhơn Bay');
  });
});
