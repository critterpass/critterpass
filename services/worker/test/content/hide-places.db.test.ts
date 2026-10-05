/**
 * A places release can hide a record (a recommended place pinned far from the place it names,
 * with nothing at the place to merge it into). Publishing takes it out of the catalogue, and
 * refuses while a trip's stop, idea or must-do still points at it.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishRelease } from '../../src/content';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertCrew, insertUser } from '../notify-fixtures';

let harness: JobsHarness;
let destinationId: string;
let people: string[];
let version = 0;

async function one(sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

/** A curated must-see pinned in the city, named for a place far outside it. */
async function misplaced(name: string): Promise<{ id: string; ref: string }> {
  const ref = randomUUID().slice(0, 8);
  const id = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, curation, editorial)
     VALUES ($1, $2, 'museum', -13.5192, -71.9751, jsonb_build_object('overture', $3::text),
       'editorial', '{"why_go": "An Inca citadel.", "must_see": true, "essential": true, "entry_short": "Ticket"}')
     RETURNING id`,
    [destinationId, name, ref],
  );
  return { id, ref };
}

const item = (ref: string, name: string, hide: boolean): ContentItem<'places'> => ({
  ref: `overture:${ref}`,
  destination: 'cusco',
  name,
  name_local: null,
  category: 'nature',
  lat: -13.5192,
  lng: -71.9751,
  address: null,
  tz: 'America/Lima',
  tags: ['history'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: ref,
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: 'A citadel above the Urubamba valley.',
    best_time: 'Early morning',
    time_needed_min: 240,
    crowd_hint: 'Busy all day',
    etiquette: null,
  },
  merge_into: null,
  possible_duplicate_of: null,
  ...(hide ? { hide: true as const } : {}),
});

async function publish(items: readonly ContentItem<'places'>[]) {
  version += 1;
  const owner = people[0];
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
    approved_by: owner ?? null,
  });
  const releaseId = await one(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, approved_by, approved_at)
     VALUES ('places', $1, $2, $2, 'approved', 'approve', $3, $4, $5, $6, now()) RETURNING id`,
    [
      version,
      `places-${version}-${randomUUID()}`,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      owner,
    ],
  );
  return withSystem(harness.pool, (tx) => publishRelease(tx, releaseId));
}

const stored = async (id: string) =>
  (
    await harness.pool.query<{
      name: string;
      category: string;
      status: string;
      curation: string;
      editorial: Record<string, unknown>;
    }>('SELECT name, category, status, curation, editorial FROM pois WHERE id = $1', [id])
  ).rows[0];

const newTrip = async () =>
  one(
    `INSERT INTO trips (crew_id, status, destination_id, tz)
     VALUES ($1, 'setup', $2, 'America/Lima') RETURNING id`,
    [await insertCrew(harness.pool, people), destinationId],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  people = [await insertUser(harness.pool), await insertUser(harness.pool)];
  destinationId = await one(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('cusco', 'Cusco', 'live', 'America/Lima') RETURNING id`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

describe('publishing a places release that hides a record', () => {
  it('hides it, takes it out of the recommended set and leaves its note as it was', async () => {
    const place = await misplaced('Machu Picchu, Peru - Wonder Of The World');
    const other = await misplaced('Sacsayhuamán');
    await publish([item(place.ref, 'Machu Picchu', true), item(other.ref, 'Sacsayhuamán', false)]);
    expect(await stored(place.id)).toEqual({
      // Not overlaid: the item's name and kind are not written to a record that goes away.
      name: 'Machu Picchu, Peru - Wonder Of The World',
      category: 'museum',
      status: 'hidden',
      curation: 'auto',
      editorial: { why_go: 'An Inca citadel.', entry_short: 'Ticket' },
    });
    expect(await stored(other.id)).toMatchObject({
      name: 'Sacsayhuamán',
      status: 'active',
      curation: 'editorial',
    });

    // Later releases keep the item. A record already hidden is not looked at again, so a row
    // that came to point at it since does not hold a publish up.
    const tripId = await newTrip();
    await harness.pool.query(
      `INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, 'Machu Picchu', $3)`,
      [tripId, people[0], place.id],
    );
    await publish([item(place.ref, 'Machu Picchu', true)]);
    expect(await stored(place.id)).toMatchObject({ status: 'hidden', curation: 'auto' });
  });

  it('refuses while a must-do, an idea or a stop of a trip points at the record', async () => {
    const tripId = await newTrip();
    const pointers: Record<string, (poiId: string) => Promise<unknown>> = {
      'a must-do': (poiId) =>
        harness.pool.query(
          `INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, 'Rainbow', $3)`,
          [tripId, people[0], poiId],
        ),
      'an idea': (poiId) =>
        harness.pool.query(
          `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
           SELECT $1, id, name, category, lat, lng, ARRAY[$3::uuid], ARRAY['save'] FROM pois
            WHERE id = $2`,
          [tripId, poiId, people[0]],
        ),
      'a stop': async (poiId) => {
        const versionId = await one(
          `INSERT INTO itinerary_versions (trip_id, visibility, status)
           VALUES ($1, 'crew', 'current') RETURNING id`,
          [tripId],
        );
        const dayId = await one(
          `INSERT INTO plan_days (version_id, trip_id, day_no, date)
           VALUES ($1, $2, 1, '2026-11-02') RETURNING id`,
          [versionId, tripId],
        );
        await harness.pool.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
             poi_id, category)
           VALUES ($1, $2, $3, $4, '2026-11-02T14:00:00Z', '2026-11-02T16:00:00Z', 'America/Lima',
             $5, 'activity')`,
          [versionId, dayId, tripId, randomUUID(), poiId],
        );
      },
    };
    for (const [what, point] of Object.entries(pointers)) {
      const used = await misplaced(`Rainbow Mountain (${what})`);
      const unused = await misplaced(`Humantay Lake (${what})`);
      await point(used.id);
      await expect(
        publish([
          item(unused.ref, 'Humantay Lake', true),
          item(used.ref, 'Rainbow Mountain', true),
        ]),
        what,
      ).rejects.toThrow(`a trip points at 1 of the places to hide`);
      await expect(publish([item(used.ref, 'Rainbow Mountain', true)]), what).rejects.toThrow(
        `Rainbow Mountain (${what})`,
      );
      // Nothing of a refused publish is written: the record no trip points at stays too.
      for (const record of [used, unused]) {
        expect(await stored(record.id), what).toMatchObject({
          status: 'active',
          curation: 'editorial',
          editorial: { must_see: true, essential: true },
        });
      }
    }
  });
});
