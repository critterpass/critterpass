/**
 * `trip_places` (C1, RLS T): one card per place a trip uses. Crew cards are read and synced by the
 * trip's members only; an organiser-only draft's cards reach its organisers and never a member; no
 * client writes a card. `app.refresh_trip_places` follows the trip's references: a place dropped
 * from the trip leaves, an unchanged refresh writes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let draftPlaceId: string;
let ideaPlaceId: string;

const refresh = (tripId: string): Promise<number> =>
  withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ changed: number }>(
      'SELECT app.refresh_trip_places($1) AS changed',
      [tripId],
    );
    return rows[0]!.changed;
  });

const cardIds = async (
  stream: 'trip' | 'trip_draft',
  actor: 'member' | 'organiser',
): Promise<string[]> =>
  idsByTable(await harness.rows(stream, actor, { trip_id: harness.fixture.tripId }))[
    'trip_places'
  ] ?? [];

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId } = harness.fixture;
  const seeded = await withSystem(harness.db.pool, async (tx) => {
    const place = async (name: string): Promise<string> => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         SELECT destination_id, $1, 'other', 1, 1 FROM pois WHERE name = 'Matrix Probe POI'
         RETURNING id`,
        [name],
      );
      return rows[0]!.id;
    };
    const draftPlace = await place('Must-do in an organiser draft');
    const ideaPlace = await place('Saved from a link');
    const version = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status)
       VALUES ($1, 'organiser', 'draft') RETURNING id`,
      [tripId],
    );
    const day = await tx.query<{ id: string }>(
      'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
      [version.rows[0]!.id, tripId],
    );
    await tx.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, category)
       VALUES ($1, $2, $3, $4, 'sightseeing')`,
      [version.rows[0]!.id, day.rows[0]!.id, tripId, draftPlace],
    );
    await tx.query(
      `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, sources)
       VALUES ($1, $2, 'Idea', 'other', 1, 1, ARRAY['link'])`,
      [tripId, ideaPlace],
    );
    return { draftPlace, ideaPlace };
  });
  draftPlaceId = seeded.draftPlace;
  ideaPlaceId = seeded.ideaPlace;
  await refresh(tripId);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_places', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'trip_places');
  });

  it("keeps an organiser draft's place from members, on the database and on the streams", async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM trip_places WHERE trip_id = $1 AND poi_id = $2';
    const visible = (uid: string) =>
      withUser(harness.db.pool, uid, crypto.randomUUID(), async (tx) => {
        const { rowCount } = await tx.query(probe, [tripId, draftPlaceId]);
        return rowCount ?? 0;
      });
    expect(await visible(actors.organiser)).toBe(1);
    expect(await visible(actors.member)).toBe(0);
    expect(await cardIds('trip_draft', 'organiser')).toContain(draftPlaceId);
    expect(await cardIds('trip_draft', 'member')).toEqual([]);
    expect(await cardIds('trip', 'member')).not.toContain(draftPlaceId);
    expect(await cardIds('trip', 'organiser')).not.toContain(draftPlaceId);
  });

  it('sends a card keyed by its place, with the roles kept on the server', async () => {
    const rows =
      (await harness.rows('trip', 'member', { trip_id: harness.fixture.tripId })).get(
        'trip_places',
      ) ?? [];
    const card = rows.find((row) => row['id'] === ideaPlaceId);
    expect(card?.['name']).toBe('Saved from a link');
    for (const column of ['roles', 'visibility', 'trip_id', 'poi_id']) {
      expect(card).not.toHaveProperty(column);
    }
  });

  it('writes nothing when nothing changed, and drops a place the trip stops using', async () => {
    const { tripId } = harness.fixture;
    expect(await refresh(tripId)).toBe(0);
    await withSystem(harness.db.pool, (tx) =>
      tx.query('UPDATE trip_ideas SET deleted_at = now() WHERE trip_id = $1 AND poi_id = $2', [
        tripId,
        ideaPlaceId,
      ]),
    );
    expect(await refresh(tripId)).toBe(1);
    expect(await cardIds('trip', 'member')).not.toContain(ideaPlaceId);
  });

  it('follows a change to the place itself', async () => {
    const { tripId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE pois SET name = 'Renamed draft must-do' WHERE id = $1", [draftPlaceId]),
    );
    expect(await refresh(tripId)).toBe(1);
    const rows =
      (await harness.rows('trip_draft', 'organiser', { trip_id: tripId })).get('trip_places') ?? [];
    expect(rows.find((row) => row['id'] === draftPlaceId)?.['name']).toBe('Renamed draft must-do');
  });
});
