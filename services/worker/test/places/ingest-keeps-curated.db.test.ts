/**
 * A places release corrects a record's name, kind and (for a record it creates) point. An ingest
 * that reads the record again from its source must leave those as the release set them, and may
 * still add what the release does not own: source ids, confidence, website, phone and brand.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishRelease } from '../../src/content';
import { ingestDestination, type PlaceSourceRow } from '../../src/places/ingest';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertUser } from '../notify-fixtures';

let harness: JobsHarness;
let destinationId: string;
let owner: string;

const BBOX = { minLat: 63.7, maxLat: 64.85, minLng: -22.8, maxLng: -19.5 };

const lagoon: ContentItem<'places'> = {
  ref: 'overture:lagoon',
  destination: 'iceland',
  name: 'Blue Lagoon',
  name_local: 'Bláa lónið',
  category: 'nature',
  lat: 63.88038,
  lng: -22.44756,
  address: 'Norðurljósavegur 9, Grindavík',
  tz: 'Atlantic/Reykjavik',
  tags: ['wellness'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: 'lagoon',
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: 'A geothermal lagoon in a lava field.',
    best_time: 'First slot of the day',
    time_needed_min: 180,
    crowd_hint: 'Timed tickets sell out',
    etiquette: null,
    must_see: true,
  },
  merge_into: null,
  possible_duplicate_of: null,
};

/** The same record as its source holds it: another name, another kind, a point 300 m away. */
const fromSource: PlaceSourceRow = {
  sourceId: 'lagoon',
  name: 'Blue Lagoon Iceland',
  categoryLabels: ['spa'],
  lat: 63.8829,
  lng: -22.4491,
  address: 'Svartsengi',
  confidence: 0.97,
  website: 'https://www.bluelagoon.com',
  phone: '+354 420 8800',
};

const ingest = (overture: readonly PlaceSourceRow[], fsq: readonly PlaceSourceRow[] = []) =>
  ingestDestination(
    harness.pool,
    { destinationId, bbox: BBOX },
    {
      readOverturePlaces: () => Promise.resolve(overture),
      readFsqOsPlaces: () => Promise.resolve(fsq),
    },
  );

async function publish(items: readonly ContentItem<'places'>[]) {
  const artifact = buildRelease({
    kind: 'places',
    version: 1,
    items,
    generated_by: {
      batch_key: 'places-1',
      route: null,
      model: null,
      generated_at: '2026-10-05T00:00:00.000Z',
    },
    approved_by: owner,
  });
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, approved_by, approved_at)
     VALUES ('places', 1, $1, $1, 'approved', 'approve', $2, $3, $4, $5, now()) RETURNING id`,
    [`places-${randomUUID()}`, artifact.checksum, JSON.stringify(artifact), items.length, owner],
  );
  const releaseId = rows[0]?.id;
  if (releaseId === undefined) throw new Error('no release row');
  return withSystem(harness.pool, (tx) => publishRelease(tx, releaseId));
}

const stored = async (overtureId: string) =>
  (
    await harness.pool.query<Record<string, unknown>>(
      `SELECT name, name_local, category, lat, lng, address, curation, source_ids, website, phone,
              editorial ->> 'why_go' AS why_go
         FROM pois WHERE source_ids ->> 'overture' = $1`,
      [overtureId],
    )
  ).rows[0];

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = await insertUser(harness.pool);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('iceland', 'Iceland', 'live', 'Atlantic/Reykjavik') RETURNING id`,
  );
  destinationId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

describe('an ingest over a place a release curated', () => {
  it('keeps the name, kind, point and address of the release and adds the open data', async () => {
    await publish([lagoon]);
    const cafe: PlaceSourceRow = {
      sourceId: 'cafe',
      name: 'Lava Cafe',
      categoryLabels: ['cafe'],
      lat: 63.8802,
      lng: -22.4489,
      confidence: 0.9,
    };
    await ingest([fromSource, cafe], [{ ...fromSource, sourceId: 'fsq-lagoon' }]);

    expect(await stored('lagoon')).toEqual({
      name: 'Blue Lagoon',
      name_local: 'Bláa lónið',
      category: 'nature',
      lat: 63.88038,
      lng: -22.44756,
      address: 'Norðurljósavegur 9, Grindavík',
      curation: 'editorial',
      source_ids: { overture: 'lagoon', fsq_os: 'fsq-lagoon' },
      website: 'https://www.bluelagoon.com',
      phone: '+354 420 8800',
      why_go: 'A geothermal lagoon in a lava field.',
    });

    // A place no release curated still follows its source.
    await ingest([fromSource, { ...cafe, name: 'Lava Restaurant', lat: 63.8803 }]);
    expect(await stored('cafe')).toMatchObject({
      name: 'Lava Restaurant',
      lat: 63.8803,
      curation: 'auto',
    });
    expect(await stored('lagoon')).toMatchObject({ name: 'Blue Lagoon', category: 'nature' });
  });
});
