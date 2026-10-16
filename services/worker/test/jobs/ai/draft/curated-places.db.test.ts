/**
 * A researched destination's draft places, read from a migrated Postgres: the researchers' line
 * decides what kind of place a row is (a fado house open data files as a restaurant is a night
 * out, a puppet theatre filed as a hotel is still read), and once they ranked the essentials, an
 * editors' older essential or must-see flag no longer makes one.
 */
import { withSystem } from '@cp/db';
import { foodRole } from '@cp/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadDraftPlaces, TYPED_PLACES_KEY } from '../../../../src/jobs/ai/draft/load-places';
import { startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';

let harness: JobsHarness;
let city: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  await withSystem(harness.pool, async (tx) => {
    city = (
      await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, country, tz, currency)
         VALUES ('curated-town', 'Curated Town', 'Portugal', 'Europe/Lisbon', 'EUR') RETURNING id`,
      )
    ).rows[0]?.id as string;
    const add = (name: string, category: string, curation: string, editorial: object) =>
      tx.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial)
         VALUES ($1, $2, $3, 38.71, -9.13, $4, $5)`,
        [city, name, category, curation, JSON.stringify(editorial)],
      );
    await add('Castle', 'museum', 'editorial', {
      essential: true,
      curated: { rank: 1, essential_rank: 1, best_times: ['morning'], area: 'Old Town' },
    });
    await add('Aquarium', 'museum', 'editorial', { essential: true, must_see: true });
    await add('Fado House', 'food', 'editorial', {
      curated: { rank: 2, best_times: ['evening', 'after_dark'], tags: ['nightlife', 'culture'] },
    });
    await add('Puppet Theatre', 'stay', 'editorial', {
      curated: { rank: 3, best_times: ['evening'], tags: ['culture'] },
    });
    await add('Riverside Hotel', 'stay', 'editorial', { why_go: 'A bed by the river.' });
  });
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('a researched destination’s draft places', () => {
  it('reads each row as the kind of place its researchers’ line says', async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO ops.ops_config (key, value) VALUES ($1, 'true'::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [TYPED_PLACES_KEY],
      ),
    );
    const places = new Map(
      (await loadDraftPlaces(harness.pool, city, [])).map((poi) => [poi.name, poi]),
    );
    const fado = places.get('Fado House');
    expect(fado?.category).toBe('nightlife');
    expect(fado === undefined ? 'missing' : foodRole(fado)).toBeNull();
    expect(places.get('Puppet Theatre')?.category).toBe('other');
    expect(places.has('Riverside Hotel')).toBe(false);
  });

  it('takes its essentials and must-sees from the researchers once they ranked them', async () => {
    const places = new Map(
      (await loadDraftPlaces(harness.pool, city, [])).map((poi) => [poi.name, poi]),
    );
    expect(places.get('Castle')).toMatchObject({ essential: true, mustSee: true });
    expect(places.get('Aquarium')?.essential).toBeUndefined();
    expect(places.get('Aquarium')?.mustSee).toBe(false);
  });
});
