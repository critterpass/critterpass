/**
 * A places release carries a note's lines in other languages. Publishing stores them with the
 * note (`editorial.i18n`), and a later release whose item has none clears them.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishRelease } from '../../src/content';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertUser } from '../notify-fixtures';

let harness: JobsHarness;
let owner: string;
let version = 0;

const falls = (i18n?: ContentItem<'places'>['i18n']): ContentItem<'places'> => ({
  ref: 'overture:datanla',
  destination: 'vn-da-lat',
  name: 'Datanla Falls',
  name_local: 'Thác Datanla',
  category: 'nature',
  lat: 11.9017,
  lng: 108.4494,
  address: null,
  tz: 'Asia/Ho_Chi_Minh',
  tags: ['nature'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: 'datanla',
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: 'A waterfall reached by an alpine coaster.',
    best_time: 'Morning',
    time_needed_min: 150,
    crowd_hint: 'Coaster queues by mid-morning',
    etiquette: null,
    must_see: true,
  },
  merge_into: null,
  possible_duplicate_of: null,
  ...(i18n === undefined ? {} : { i18n }),
});

async function publish(item: ContentItem<'places'>) {
  version += 1;
  const artifact = buildRelease({
    kind: 'places',
    version,
    items: [item],
    generated_by: {
      batch_key: `places-${version}`,
      route: null,
      model: null,
      generated_at: '2026-10-05T00:00:00.000Z',
    },
    approved_by: owner,
  });
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, approved_by, approved_at)
     VALUES ('places', $1, $2, $2, 'approved', 'approve', $3, $4, 1, $5, now()) RETURNING id`,
    [version, `places-${randomUUID()}`, artifact.checksum, JSON.stringify(artifact), owner],
  );
  const releaseId = rows[0]?.id;
  if (releaseId === undefined) throw new Error('no release row');
  return withSystem(harness.pool, (tx) => publishRelease(tx, releaseId));
}

const stored = async () =>
  (
    await harness.pool.query<{ editorial: Record<string, unknown> }>(
      "SELECT editorial FROM pois WHERE source_ids ->> 'overture' = 'datanla'",
    )
  ).rows[0]?.editorial;

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = await insertUser(harness.pool);
  await harness.pool.query(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'live', 'Asia/Ho_Chi_Minh')`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

describe('publishing a note in other languages', () => {
  it('stores the translations with the note, replaces them, and clears them', async () => {
    await publish(
      falls({ vi: { why_go: 'Thác nước, xuống bằng máng trượt.', best_time: 'Sáng' } }),
    );
    expect(await stored()).toMatchObject({
      why_go: 'A waterfall reached by an alpine coaster.',
      i18n: { vi: { why_go: 'Thác nước, xuống bằng máng trượt.', best_time: 'Sáng' } },
    });

    // A later translation replaces the earlier one whole: a line it drops is gone.
    await publish(falls({ vi: { why_go: 'Thác Datanla và máng trượt.' } }));
    expect((await stored())?.['i18n']).toEqual({ vi: { why_go: 'Thác Datanla và máng trượt.' } });

    await publish(falls());
    expect(await stored()).not.toHaveProperty('i18n');
    expect(await stored()).toMatchObject({ why_go: 'A waterfall reached by an alpine coaster.' });
  });
});
