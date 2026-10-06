/**
 * A day-trip area is reached from its city and is never a place to go on its own: the destination
 * search leaves it out, a pitch or a new trip for it answers `NOT_FOUND{place}`, and a pitch for its
 * base city never offers it as another place of the same set.
 */
import { randomUUID } from 'node:crypto';

import { loadPitchFacts, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePlace } from '../../../src/commands/polls/candidates';
import { searchDestinations } from '../../../src/routes/places-search';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const place = { cusco: '', machuPicchu: '', arequipa: '' };

beforeAll(async () => {
  harness = await startSetupHarness();
  crew = await buildSetupCrew(harness, 1);
  await withSystem(harness.pool, async (tx) => {
    const { rows: release } = await tx.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
         artifact, item_count)
       VALUES ('sets', 900, $1, $1, 'review', 'review', repeat('a', 64), '{}', 1) RETURNING id`,
      [`areas-${randomUUID().slice(0, 8)}`],
    );
    const { rows: set } = await tx.query<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ($1, 'Peru', 'PE', 3, 'America/Lima', 'PEN', '{es}', 'guest', 'cp-145', '[]', $2)
       RETURNING id`,
      [`p${randomUUID().slice(0, 4)}`, release[0]!.id],
    );
    const destination = async (name: string, coverage: string) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, country, coverage, critter_set_id, tz, currency)
         VALUES ($1, $2, 'Peru', $3, $4, 'America/Lima', 'PEN') RETURNING id`,
        [
          `${name.toLowerCase().replace(/\s/gu, '-')}-${randomUUID().slice(0, 6)}`,
          name,
          coverage,
          set[0]!.id,
        ],
      );
      return rows[0]!.id;
    };
    place.cusco = await destination('Cusco', 'guest');
    place.machuPicchu = await destination('Machu Picchu', 'area');
    place.arequipa = await destination('Arequipa', 'guest');
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('an area is never a city', () => {
  it('is left out of the destination search', async () => {
    const found = await withSystem(harness.pool, async (tx) => ({
      area: await searchDestinations(tx, 'Machu Picchu', 10),
      city: await searchDestinations(tx, 'Cusco', 10),
    }));
    expect(found.area.map((row) => row.place_id)).not.toContain(place.machuPicchu);
    expect(found.city.map((row) => row.place_id)).toContain(place.cusco);
  });

  it('cannot be pitched, voted on or start a trip', async () => {
    await expect(
      withSystem(harness.pool, (tx) => resolvePlace(tx, place.machuPicchu)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'place' } });
    const city = await withSystem(harness.pool, (tx) => resolvePlace(tx, place.cusco));
    expect(city.id).toBe(place.cusco);
    const facts = await withSystem(harness.pool, (tx) =>
      loadPitchFacts(tx, {
        crewId: crew.crewId,
        placeId: place.machuPicchu,
        month: 6,
        now: new Date(),
      }),
    );
    expect(facts).toBeUndefined();
  });

  it("is never offered as another place of its city's set", async () => {
    const facts = await withSystem(harness.pool, (tx) =>
      loadPitchFacts(tx, { crewId: crew.crewId, placeId: place.cusco, month: 6, now: new Date() }),
    );
    const offered = facts?.facts.alternatives.map((pick) => pick.place_id) ?? [];
    expect(offered).toContain(place.arequipa);
    expect(offered).not.toContain(place.machuPicchu);
  });
});
