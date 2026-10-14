/**
 * The base-set build against a migrated Postgres: existing seed, critter and area rows keep their
 * slug, name, coverage and critter and only gain the build's facts; new rows land as `base` rows
 * with a box; a second build changes no slug. Commons photos (a recorded metadata reply) are
 * stored with their licence and credit, a GFDL-only file is refused, and publishing a `media`
 * release leaves them in place.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { buildRelease } from '@cp/content';
import { withSystem } from '@cp/db';
import { MEDIA_INGEST_QUEUE, type BaseCandidate } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureQueues, queueSpec } from '../../src/boss/queues';
import { publishRelease } from '../../src/content/publish';
import type { GeoNamesFiles } from '../../src/destinations/base/geonames';
import { storeBasePhotos } from '../../src/destinations/base/photos';
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
  lat: 16.05,
  lng: 108.2,
  population: null,
  sitelinks: 0,
  photoFile: null,
  ...overrides,
});

const wikidata = [
  candidate({
    name: 'Đà Nẵng',
    qid: 'Q25282',
    sitelinks: 90,
    names: { en: 'Da Nang', vi: 'Đà Nẵng' },
  }),
  candidate({
    name: 'Hội An',
    qid: 'Q200',
    sitelinks: 70,
    lat: 15.88,
    lng: 108.33,
    names: { en: 'Hoi An' },
  }),
  candidate({
    name: 'Quy Nhơn',
    qid: 'Q1500',
    sitelinks: 40,
    lat: 13.77,
    lng: 109.22,
    photoFile: 'Heraklion banner.jpg',
  }),
];
const geonames: GeoNamesFiles = {
  cities: [
    candidate({
      name: 'Quy Nhơn',
      geonamesId: 1568574,
      admin1: 'Bình Định Province',
      population: 210_338,
      lat: 13.78,
      lng: 109.21,
      names: { en: 'Qui Nhon', vi: 'Quy Nhơn' },
      tz: 'Asia/Ho_Chi_Minh',
    }),
    candidate({
      name: 'Tuy Hòa',
      geonamesId: 1563281,
      population: 120_000,
      lat: 13.09,
      lng: 109.3,
    }),
  ],
  countries: new Map([['VN', { name: 'Vietnam', currency: 'VND' }]]),
  admin1: new Map(),
};

beforeAll(async () => {
  harness = await startJobsHarness();
  const boss = await harness.startRuntime([]);
  await ensureQueues(boss, [[MEDIA_INGEST_QUEUE, queueSpec(MEDIA_INGEST_QUEUE)]]);
  await harness.pool.query(
    `INSERT INTO destinations (slug, name, country, coverage, origin, critter_key) VALUES
       ('da-nang', 'Đà Nẵng', 'Vietnam', 'live', 'seed', NULL),
       ('vn-hoi-an', 'Hội An', 'Vietnam', 'live', 'critter', 'cp-005'),
       ('vn-son-tra', 'Sơn Trà', 'Vietnam', 'area', 'area', NULL)`,
  );
}, 180_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

type Row = {
  slug: string;
  name: string;
  coverage: string;
  origin: string;
  critter_key: string | null;
  wikidata_qid: string | null;
  has_box: boolean;
};

async function rows(): Promise<Row[]> {
  const { rows } = await harness.pool.query<Row>(
    `SELECT slug, name, coverage, origin, critter_key, wikidata_qid, place_bounds IS NOT NULL AS has_box
       FROM destinations ORDER BY slug`,
  );
  return rows;
}

describe('base-set build', { timeout: 120_000 }, () => {
  it('enriches the existing rows and adds base rows, and a second build changes no slug', async () => {
    const first = await runBaseBuild(harness.pool, {
      skipPhotos: true,
      sources: { geonames, wikidata },
    });
    expect(first).toMatchObject({ inserted: 2, enriched: 2, vietnam: 4 });
    const after = await rows();
    expect(after).toEqual([
      {
        slug: 'da-nang',
        name: 'Đà Nẵng',
        coverage: 'live',
        origin: 'seed',
        critter_key: null,
        wikidata_qid: 'Q25282',
        has_box: false,
      },
      {
        slug: 'vn-hoi-an',
        name: 'Hội An',
        coverage: 'live',
        origin: 'critter',
        critter_key: 'cp-005',
        wikidata_qid: 'Q200',
        has_box: false,
      },
      {
        slug: 'vn-quy-nhon',
        name: 'Quy Nhơn',
        coverage: 'guest',
        origin: 'base',
        critter_key: null,
        wikidata_qid: 'Q1500',
        has_box: true,
      },
      {
        slug: 'vn-son-tra',
        name: 'Sơn Trà',
        coverage: 'area',
        origin: 'area',
        critter_key: null,
        wikidata_qid: null,
        has_box: false,
      },
      {
        slug: 'vn-tuy-hoa',
        name: 'Tuy Hòa',
        coverage: 'guest',
        origin: 'base',
        critter_key: null,
        wikidata_qid: null,
        has_box: true,
      },
    ]);
    const second = await runBaseBuild(harness.pool, {
      skipPhotos: true,
      sources: { geonames, wikidata },
    });
    expect(second).toMatchObject({ inserted: 0, enriched: 4 });
    expect((await rows()).map((row) => row.slug)).toEqual(after.map((row) => row.slug));
    const { rows: quy } = await harness.pool.query<{
      geonames_id: number;
      population: number;
      names: unknown;
      currency: string;
    }>(
      "SELECT geonames_id, population, names, currency FROM destinations WHERE slug = 'vn-quy-nhon'",
    );
    expect(quy[0]).toMatchObject({
      geonames_id: 1568574,
      population: 210_338,
      currency: 'VND',
      names: { vi: 'Quy Nhơn' },
    });
  });

  it('stores licensed Commons photos and keeps them through a media release', async () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/commons-four-licences.json', import.meta.url), 'utf8'),
    ) as { body: unknown };
    const fetchStub = (() =>
      Promise.resolve(new Response(JSON.stringify(fixture.body)))) as typeof fetch;
    const counts = await storeBasePhotos(
      harness.pool,
      [
        { slug: 'vn-quy-nhon', file: 'Heraklion banner.jpg' },
        { slug: 'vn-tuy-hoa', file: 'Baalbek banner.jpg' },
        { slug: 'vn-hoi-an', file: 'WV banner Kingston upon Hull.jpg' },
        { slug: 'da-nang', file: 'Shibam banner.png' },
      ],
      { fetch: fetchStub },
    );
    expect(counts).toMatchObject({ asked: 4, stored: 3, refused: 1, queued: 3 });
    const { rows: assets } = await harness.pool.query<{
      subject_keys: string[];
      licence: string;
      credit: string;
    }>(
      "SELECT subject_keys, licence, credit FROM media_assets WHERE source = 'wikimedia' ORDER BY licence",
    );
    expect(assets.map((a) => [a.subject_keys[0], a.licence])).toEqual([
      ['destination:vn-hoi-an', 'cc0'],
      ['destination:vn-tuy-hoa', 'cc-by-3.0'],
      ['destination:vn-quy-nhon', 'cc-by-sa-4.0'],
    ]);
    expect(assets.every((a) => a.credit.endsWith('· Wikimedia Commons'))).toBe(true);

    const approvedBy = randomUUID();
    const artifact = buildRelease({
      kind: 'media',
      version: 1,
      items: [],
      generated_by: {
        batch_key: 'heroes',
        route: null,
        model: null,
        generated_at: '2026-10-14T00:00:00Z',
      },
      approved_by: approvedBy,
    });
    const { rows: release } = await harness.pool.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
         item_count, approved_by, approved_at)
       VALUES ('media', 1, $1, 'heroes', 'approved', 'approve', $2, $3, 0, $4, now()) RETURNING id`,
      [`media-heroes-${randomUUID()}`, artifact.checksum, JSON.stringify(artifact), approvedBy],
    );
    await withSystem(harness.pool, (tx) => publishRelease(tx, release[0]!.id));
    const { rows: left } = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM media_assets WHERE source = 'wikimedia'",
    );
    expect(left[0]?.n).toBe(3);
  });
});
