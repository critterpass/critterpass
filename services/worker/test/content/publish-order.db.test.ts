/**
 * Two batches of a kind approved one after the other are each laid over the live release of the
 * moment. If the second goes live first, the first carries the older catalogue: publishing it
 * afterwards would write that over the second and lose the second's changes. Publishing refuses it
 * as stale instead, and its batch, approved again on top of what is live, brings its changes too.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { enqueue } from '../../src/boss';
import { contentJobs, publishRelease } from '../../src/content';
import { contentPublishJob } from '../../src/content/publish';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const owner = randomUUID();

beforeAll(async () => {
  harness = await startJobsHarness();
  await harness.pool.query(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh')",
  );
}, 240_000);

afterEach(() => harness.stopAll());
afterAll(() => harness?.close());

const place = (id: string, name: string, vi?: string): ContentItem<'places'> => ({
  ref: `overture:${id}`,
  destination: 'da-nang',
  name,
  name_local: null,
  category: 'food',
  lat: 16.06,
  lng: 108.22,
  address: null,
  tz: 'Asia/Ho_Chi_Minh',
  tags: ['street_food'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: id,
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: `${name}, a local favourite.`,
    best_time: 'Lunch',
    time_needed_min: 45,
    crowd_hint: 'Busy at noon',
    etiquette: null,
  },
  merge_into: null,
  possible_duplicate_of: null,
  ...(vi === undefined ? {} : { i18n: { vi: { why_go: vi } } }),
});

/** An approved release, approved now, as the console leaves it. */
async function approved(version: number, items: readonly ContentItem<'places'>[]) {
  const artifact = buildRelease({
    kind: 'places',
    version,
    items,
    generated_by: {
      batch_key: `places-${version}`,
      route: null,
      model: null,
      generated_at: '2026-10-05T00:00:00.000Z',
    },
    approved_by: owner,
  });
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('places', $1, $2, $2, 'approved', 'approve', $3, $4, $5, $6, clock_timestamp())
     RETURNING id`,
    [
      version,
      `places-${version}-${randomUUID()}`,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      owner,
    ],
  );
  return rows[0]!.id;
}

const publish = (id: string) => withSystem(harness.pool, (tx) => publishRelease(tx, id));

const notes = async () =>
  Object.fromEntries(
    (
      await harness.pool.query<{ name: string; vi: string | null }>(
        `SELECT name, editorial #>> '{i18n,vi,why_go}' AS vi FROM pois ORDER BY name`,
      )
    ).rows.map((row) => [row.name, row.vi]),
  );

describe('two places batches approved before either is published', () => {
  it('refuses the older one once the newer is live, and loses nothing when it is approved again', async () => {
    const live = [place('must-see', 'Mì Quảng Bà Mua'), place('other', 'Bánh Xèo Bà Dưỡng')];
    await publish(await approved(1, live));

    // A: the must-see in Vietnamese. B: the other place in Vietnamese. Both laid over v1.
    const a = await approved(2, [place('must-see', 'Mì Quảng Bà Mua', 'Mì Quảng'), live[1]!]);
    const b = await approved(3, [live[0]!, place('other', 'Bánh Xèo Bà Dưỡng', 'Bánh xèo')]);

    // B publishes first; A's publish runs again afterwards (a retry).
    await publish(b);
    const boss = await harness.startRuntime(contentJobs());
    await enqueue(boss, contentPublishJob(), { release_id: a });
    let a1 = { status: 'approved', blocked_reason: null as string | null };
    for (let i = 0; i < 60 && a1.status === 'approved'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      a1 = (
        await harness.pool.query<{ status: string; blocked_reason: string | null }>(
          'SELECT status, blocked_reason FROM content_releases WHERE id = $1',
          [a],
        )
      ).rows[0]!;
    }
    expect(a1.status).toBe('blocked');
    expect(a1.blocked_reason).toContain('stale: places v3 went live after v2 was approved');
    // B's change is still there.
    expect(await notes()).toEqual({ 'Bánh Xèo Bà Dưỡng': 'Bánh xèo', 'Mì Quảng Bà Mua': null });

    // A's batch approved again on top of what is live brings its change, and B's stays.
    await publish(
      await approved(4, [
        place('must-see', 'Mì Quảng Bà Mua', 'Mì Quảng'),
        place('other', 'Bánh Xèo Bà Dưỡng', 'Bánh xèo'),
      ]),
    );
    expect(await notes()).toEqual({
      'Bánh Xèo Bà Dưỡng': 'Bánh xèo',
      'Mì Quảng Bà Mua': 'Mì Quảng',
    });
  });
});
