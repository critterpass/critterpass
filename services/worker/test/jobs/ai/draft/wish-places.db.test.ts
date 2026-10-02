/**
 * The places a hand-typed must-do can name, read from a migrated Postgres through the real name
 * search (the generated `fts` column, accents folded): curated and open-data rows of the trip's
 * destination only, never a merged row, never another city's. The planner then decides which
 * place, if any, the text names. Row names follow the staging data for Đà Nẵng.
 */
import { withSystem } from '@cp/db';
import { destinationPhrases, resolveWishes } from '@cp/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadDraftPlaces, loadWishCandidates } from '../../../../src/jobs/ai/draft/load-places';
import { startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';

let harness: JobsHarness;
let daNang: string;
const ids = new Map<string, string>();
const IGNORE = destinationPhrases('Đà Nẵng, Vietnam');

type Row = readonly [name: string, category: string, lat: number, lng: number, curation: string];

const ROWS: readonly Row[] = [
  ['Marble Mountains', 'temple_shrine', 16.0029, 108.2638, 'editorial'],
  ['Ngũ Hành Sơn (Marble Mountain)', 'nature', 16.0034, 108.2644, 'editorial'],
  ['Marble Mountains Elevator', 'museum', 16.0032, 108.2644, 'editorial'],
  [
    'Cầu Rồng, Cầu Quay Sông Hàn, Cầu Tình Yêu, Cầu Trần Thị Lý',
    'nature',
    16.0679,
    108.2248,
    'editorial',
  ],
  ['Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng', 'food', 16.0659, 108.2243, 'editorial'],
  ['Dragon Bridge', 'other', 16.0611, 108.2277, 'editorial'],
  ['Thích Ca Phật Đài - Bà Nà', 'temple_shrine', 15.9975, 107.994, 'editorial'],
  ['Bãi biển Mỹ Khê', 'beach', 16.0605, 108.2468, 'editorial'],
  ['Bà Nà Hills', 'nature', 15.9972, 107.9888, 'auto'],
  ['Ba Na Hills', 'nature', 16.0312, 108.1177, 'auto'],
  ['Bà Nà Hill, Đà Nẵng, Việt Nam', 'other', 15.9977, 107.9877, 'auto'],
  ['Ba Na Brew House', 'nightlife', 15.9984, 107.9882, 'auto'],
  ['500 Triệu Đất Nam Ngũ Hành Sơn Đà Nẵng', 'other', 15.9832, 108.2563, 'auto'],
];

beforeAll(async () => {
  harness = await startJobsHarness();
  await withSystem(harness.pool, async (tx) => {
    const city = async (slug: string, name: string) =>
      (
        await tx.query<{ id: string }>(
          `INSERT INTO destinations (slug, name, country, tz, currency)
           VALUES ($1, $2, 'Vietnam', 'Asia/Ho_Chi_Minh', 'VND') RETURNING id`,
          [slug, name],
        )
      ).rows[0]?.id as string;
    daNang = await city('da-nang-wishes', 'Đà Nẵng');
    const hue = await city('hue-wishes', 'Huế');
    const add = async (destination: string, row: Row, mergedInto: string | null = null) => {
      const [name, category, lat, lng, curation] = row;
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial, merged_into_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          destination,
          name,
          category,
          lat,
          lng,
          curation,
          JSON.stringify(
            curation === 'editorial' ? { why_go: 'Worth it.', time_needed_min: 90 } : {},
          ),
          mergedInto,
        ],
      );
      return rows[0]?.id as string;
    };
    for (const row of ROWS) ids.set(row[0], await add(daNang, row));
    // A row merged into the mountain, and another city's place of the same name.
    await add(
      daNang,
      ['Marble Mountains (old)', 'nature', 16.003, 108.264, 'editorial'],
      ids.get('Marble Mountains') ?? null,
    );
    await add(hue, ['Marble Mountains', 'nature', 16.46, 107.59, 'editorial']);
  });
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const WISHES = [
  { id: 'w-marble', text: 'Marble Mountains at sunrise' },
  { id: 'w-ba-na', text: 'Bà Nà Hills' },
  { id: 'w-dragon', text: 'cầu rồng phun lửa' },
  { id: 'w-none', text: 'somewhere quiet to read' },
];

describe('places a hand-typed must-do can name', () => {
  it('reads this city’s rows by name, accents folded, without merged rows', async () => {
    const found = await loadWishCandidates(
      harness.pool,
      daNang,
      WISHES.map((wish) => wish.text),
      IGNORE,
    );
    const names = found.map((poi) => poi.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Marble Mountains',
        'Ngũ Hành Sơn (Marble Mountain)',
        'Cầu Rồng, Cầu Quay Sông Hàn, Cầu Tình Yêu, Cầu Trần Thị Lý',
        'Bà Nà Hills',
        'Ba Na Hills',
      ]),
    );
    expect(names).not.toContain('Marble Mountains (old)');
    expect(names.filter((name) => name === 'Marble Mountains')).toHaveLength(1);
    expect(found.find((poi) => poi.name === 'Bà Nà Hills')?.editorial).toBe(false);
  });

  it('gives each wish its place: curated first, the open data for what the curated set lacks', async () => {
    const found = await loadWishCandidates(
      harness.pool,
      daNang,
      WISHES.map((wish) => wish.text),
      IGNORE,
    );
    const wished = resolveWishes(WISHES, found, IGNORE);
    expect([ids.get('Marble Mountains'), ids.get('Ngũ Hành Sơn (Marble Mountain)')]).toContain(
      wished.places.get('w-marble'),
    );
    expect(wished.places.get('w-dragon')).toBe(
      ids.get('Cầu Rồng, Cầu Quay Sông Hàn, Cầu Tình Yêu, Cầu Trần Thị Lý'),
    );
    expect([ids.get('Bà Nà Hills'), ids.get('Bà Nà Hill, Đà Nẵng, Việt Nam')]).toContain(
      wished.places.get('w-ba-na'),
    );
    expect(wished.places.has('w-none')).toBe(false);

    // The draft's places then hold every curated row plus the wished open-data place.
    const places = await loadDraftPlaces(harness.pool, daNang, [
      ...wished.places.values(),
      ...wished.offered,
    ]);
    const loaded = places.map((poi) => poi.name);
    expect(loaded).toContain('Bãi biển Mỹ Khê');
    expect(loaded.some((name) => /^B[àa] N[àa] Hill/u.test(name))).toBe(true);
    expect(loaded).not.toContain('Ba Na Brew House');
    expect(loaded).not.toContain('Marble Mountains (old)');
  });
});
