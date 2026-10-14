/**
 * Loading local guides on a migrated Postgres: guides are stored by their canonical page with a
 * self-reported rating stored as none, a refused line never lands, a re-run updates and deletes a
 * guide the file dropped, and a guide hidden, removed or merged on request stays that way through
 * every later load.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  hideGuide,
  loadLocalGuides,
  mergeGuide,
  removeGuide,
} from '../../src/destinations/local-guides/load';
import { localGuideRowSchema, type LocalGuideRow } from '../../src/destinations/local-guides/rows';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

const guide = (name: string, profile: string, over: Partial<LocalGuideRow> = {}): LocalGuideRow =>
  localGuideRowSchema.parse({
    destination: 'th-bangkok',
    name,
    type: 'individual',
    languages: ['en', 'th'],
    specialties: ['food tours'],
    areas: ['Chinatown'],
    price: null,
    profile_url: profile,
    review_summary_en: `${name} is praised for pacing.`,
    review_summary_vi: `${name} được khen vì nhịp đi.`,
    rating: { value: 4.9, count: 120, platform: 'Tours by Locals', url: profile },
    licensed: 'yes',
    sources: [profile],
    ...over,
  });

const SOMCHAI = guide('Somchai T.', 'https://www.toursbylocals.com/somchai');
const WALKS = guide('Bangkok Walks', 'https://bangkokwalks.example/', {
  type: 'company',
  rating: { value: 5, count: 300, platform: 'Tripadvisor', url: 'https://bangkokwalks.example/' },
});
const NIRAN = guide('Niran', 'https://www.withlocals.com/host/niran');

async function stored() {
  const { rows } = await harness.pool.query<{
    name: string;
    profile_url: string;
    status: string;
    rating: unknown;
    review_summary: unknown;
  }>(
    'SELECT name, profile_url, status, rating, review_summary FROM local_guides ORDER BY profile_url',
  );
  return rows;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  await harness.pool.query(
    "INSERT INTO destinations (slug, name, country, coverage) VALUES ('th-bangkok', 'Bangkok', 'Thailand', 'guest')",
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('loading local guides', () => {
  it('stores guides by their page, a self-reported rating as none, and refuses a phone number', async () => {
    const report = await loadLocalGuides(
      harness.pool,
      'th-bangkok',
      [
        SOMCHAI,
        WALKS,
        guide('Call Me', 'https://callme.example/', {
          review_summary_en: 'Book on +66 81 234 5678.',
        }),
      ],
      { dryRun: false },
    );
    expect(report).toMatchObject({ status: 'loaded', written: 2, selfRated: 1, deleted: 0 });
    expect(report.refused).toEqual([{ name: 'Call Me', reason: 'looks like a phone number' }]);
    const rows = await stored();
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ['Bangkok Walks', 'listed'],
      ['Somchai T.', 'listed'],
    ]);
    expect(rows[0]?.rating).toBeNull();
    expect(rows[1]?.rating).toMatchObject({ platform: 'Tours by Locals', count: 120 });
  });

  it('updates on a re-run and deletes a listed guide the file no longer names', async () => {
    const report = await loadLocalGuides(
      harness.pool,
      'th-bangkok',
      [guide('Somchai T.', SOMCHAI.profile_url, { review_summary_en: 'Now even better.' }), NIRAN],
      { dryRun: false },
    );
    expect(report).toMatchObject({ written: 2, deleted: 1 });
    const rows = await stored();
    expect(rows.map((r) => r.name)).toEqual(['Somchai T.', 'Niran']);
    expect(rows[0]?.review_summary).toMatchObject({ en: 'Now even better.' });
  });

  it('keeps a guide hidden, removed or merged on request through later loads', async () => {
    const twin = guide('Somchai Tours', 'https://somchai-tours.example/');
    await loadLocalGuides(harness.pool, 'th-bangkok', [SOMCHAI, NIRAN, twin], { dryRun: false });
    expect(await mergeGuide(harness.pool, twin.profile_url, SOMCHAI.profile_url)).toBe(1);
    expect(await hideGuide(harness.pool, NIRAN.profile_url)).toBe(1);
    expect(await removeGuide(harness.pool, SOMCHAI.profile_url)).toBe(1);
    const report = await loadLocalGuides(harness.pool, 'th-bangkok', [SOMCHAI, NIRAN, twin], {
      dryRun: false,
    });
    expect(report).toMatchObject({ written: 0, kept: 3, deleted: 0 });
    const rows = await stored();
    expect(rows.map((r) => [r.profile_url, r.status, r.name])).toEqual([
      ['https://somchai-tours.example/', 'hidden', 'Somchai Tours'],
      ['https://www.toursbylocals.com/somchai', 'removed', ''],
      ['https://www.withlocals.com/host/niran', 'hidden', 'Niran'],
    ]);
    expect(rows[1]?.review_summary).toEqual({});
  });

  it('reports an unknown destination and writes nothing on a dry run', async () => {
    const unknown = await loadLocalGuides(harness.pool, 'xx-nowhere', [SOMCHAI], { dryRun: false });
    expect(unknown.status).toBe('unknown_destination');
    const before = await stored();
    const dry = await loadLocalGuides(harness.pool, 'th-bangkok', [WALKS], { dryRun: true });
    expect(dry).toMatchObject({ status: 'checked', written: 1 });
    expect(await stored()).toEqual(before);
  });
});
