/**
 * Critter destinations against a migrated Postgres: the base build fills a critter row it finds
 * by an alias (Sài Gòn, which had no country code or centre) instead of adding a base row, drops a
 * second Tokyo near the critter's Tokyo, and keeps a namesake in another country. Merging an
 * existing base duplicate moves its references onto the critter row, fills the critter row and
 * deletes the duplicate; a dry run changes nothing.
 */
import type { BaseCandidate } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GeoNamesFiles } from '../../src/destinations/base/geonames';
import { mergeBaseTwins } from '../../src/destinations/base/merge-twins';
import { runBaseBuild } from '../../src/destinations/base/run';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

const candidate = (
  overrides: Partial<BaseCandidate> & Pick<BaseCandidate, 'name'>,
): BaseCandidate => ({
  qid: null,
  geonamesId: null,
  names: {},
  countryCode: 'VN',
  admin1: null,
  kind: 'city',
  lat: 10.78,
  lng: 106.7,
  population: null,
  sitelinks: 50,
  photoFile: null,
  ...overrides,
});

const wikidata = [
  candidate({
    name: 'Thành phố Hồ Chí Minh',
    qid: 'Q1854',
    population: 9_000_000,
    names: { en: 'Ho Chi Minh City', vi: 'Thành phố Hồ Chí Minh' },
  }),
  candidate({ name: 'Tokyo', qid: 'Q1490', countryCode: 'JP', lat: 35.69, lng: 139.69 }),
  candidate({ name: 'Tokyo', qid: 'Q7473516', countryCode: 'JP', lat: 35.68, lng: 139.77 }),
  candidate({ name: 'London', qid: 'Q92561', countryCode: 'CA', lat: 42.98, lng: -81.25 }),
];
const geonames: GeoNamesFiles = {
  cities: [],
  countries: new Map([
    ['VN', { name: 'Vietnam', currency: 'VND' }],
    ['JP', { name: 'Japan', currency: 'JPY' }],
    ['CA', { name: 'Canada', currency: 'CAD' }],
    ['GB', { name: 'United Kingdom', currency: 'GBP' }],
  ]),
  admin1: new Map(),
};

beforeAll(async () => {
  harness = await startJobsHarness();
  await harness.pool.query(
    `INSERT INTO destinations (slug, name, country, country_code, lat, lng, coverage, origin,
       critter_key, wikidata_qid) VALUES
       ('vn-sai-gon', 'Sài Gòn', 'Vietnam', NULL, NULL, NULL, 'live', 'critter', 'cp-007', NULL),
       ('jp-tokyo', 'Tokyo', 'Japan', 'JP', 35.69, 139.69, 'live', 'critter', 'cp-062', 'Q1490'),
       ('gb-london', 'London', 'United Kingdom', 'GB', 51.5, -0.12, 'live', 'critter', 'cp-030',
        'Q84'),
       ('us-new-york', 'New York', 'United States', NULL, NULL, NULL, 'live', 'critter', 'cp-021',
        NULL)`,
  );
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

async function slugs(): Promise<string[]> {
  const { rows } = await harness.pool.query<{ slug: string }>(
    'SELECT slug FROM destinations ORDER BY slug',
  );
  return rows.map((row) => row.slug);
}

describe('critter twins', { timeout: 120_000 }, () => {
  it('fills the critter row an alias names and adds no duplicate base rows', async () => {
    await runBaseBuild(harness.pool, { skipPhotos: true, sources: { geonames, wikidata } });
    expect(await slugs()).toEqual([
      'ca-london',
      'gb-london',
      'jp-tokyo',
      'us-new-york',
      'vn-sai-gon',
    ]);
    const { rows } = await harness.pool.query(
      `SELECT slug, critter_key, country_code, lat, population, wikidata_qid, currency, origin
         FROM destinations WHERE slug = 'vn-sai-gon'`,
    );
    expect(rows[0]).toEqual({
      slug: 'vn-sai-gon',
      critter_key: 'cp-007',
      country_code: 'VN',
      lat: 10.78,
      population: 9_000_000,
      wikidata_qid: 'Q1854',
      currency: 'VND',
      origin: 'critter',
    });
  });

  it('merges an existing base duplicate into the critter row, references included', async () => {
    const { rows: base } = await harness.pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, country_code, lat, lng, population, names,
         texts, wikidata_qid, coverage, origin)
       VALUES ('us-new-york-city', 'New York City', 'United States', 'US', 40.71, -74.0, 8_800_000,
         '{"en": "New York City"}', '{"en": {"tagline": "Big apple"}}', 'Q60', 'guest', 'base')
       RETURNING id`,
    );
    await harness.pool.query(
      `INSERT INTO climate_normals (destination_id, cell, month, rain_pct, source, years)
       VALUES ($1, '40.7,-74.0', 1, array_fill(10::smallint, ARRAY[24]), 'weatherapi_history', 1)`,
      [base[0]!.id],
    );

    const dry = await mergeBaseTwins(harness.pool, { dryRun: true });
    expect(dry.pairs.map((pair) => [pair.critter.slug, pair.base.slug, pair.moved])).toEqual([
      ['us-new-york', 'us-new-york-city', { climate_normals: 1 }],
    ]);
    expect(await slugs()).toContain('us-new-york-city');

    const run = await mergeBaseTwins(harness.pool);
    expect(run.pairs).toHaveLength(1);
    expect(await slugs()).not.toContain('us-new-york-city');
    const { rows } = await harness.pool.query(
      `SELECT d.critter_key, d.country_code, d.lat, d.population, d.wikidata_qid, d.texts,
              (SELECT count(*)::int FROM climate_normals c WHERE c.destination_id = d.id) AS normals
         FROM destinations d WHERE slug = 'us-new-york'`,
    );
    expect(rows[0]).toEqual({
      critter_key: 'cp-021',
      country_code: 'US',
      lat: 40.71,
      population: 8_800_000,
      wikidata_qid: 'Q60',
      texts: { en: { tagline: 'Big apple' } },
      normals: 1,
    });
    expect((await mergeBaseTwins(harness.pool)).pairs).toEqual([]);
  });
});
