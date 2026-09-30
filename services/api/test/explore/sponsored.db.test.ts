/**
 * Sponsored slots for the lists the app builds itself, and their counts, on the real stack: a free
 * viewer gets the one labelled slot, Pass+ and a boosted trip get none, nothing shows while the
 * switch is off or once a placement's impression cap is reached, and an impression or click is a
 * daily count with nobody attached (a replayed op counts once).
 */
import { generateUuidV7 } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf } from '../setup/setup-harness';
import { startExploreWorld, type ExploreWorld } from './explore-world';

let world: ExploreWorld;
let placement: string;

beforeAll(async () => {
  world = await startExploreWorld();
  placement = await withSystem(world.harness.pool, async (tx) => {
    await tx.query("UPDATE ops.ops_config SET value = 'true' WHERE key = 'explore.sponsored'");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO sponsored_placements
         (partner, poi_id, destination_id, list_kinds, starts_at, ends_at, impression_cap, created_by)
       VALUES ('viator', $1, $2, '{map_carousel,search}', now() - interval '1 hour',
               now() + interval '1 day', 2, $3) RETURNING id`,
      [world.pois.picks[1], world.kyoto, world.a.organiser.uid],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

async function slot(who = world.a.organiser, extra = '') {
  const response = await world.get(
    who,
    `/v1/explore/sponsored?destination_id=${world.kyoto}&list_kind=map_carousel${extra}`,
  );
  expect(response.status).toBe(200);
  return response.body['slot'] as { placement_id: string; label: string } | null;
}

const record = (kind: 'impression' | 'click', opId = generateUuidV7()) =>
  world.harness.run(
    world.a.organiser,
    'record_sponsored_event',
    { placement_id: placement, list_kind: 'map_carousel', kind },
    { opId },
  );

describe('sponsored slot', () => {
  it('shows a free viewer one labelled slot, and none to Pass+ or a boosted trip', async () => {
    expect(await slot()).toMatchObject({ placement_id: placement, label: 'SPONSORED' });
    expect(await slot(world.a.organiser, `&exclude=${world.pois.picks[1]}`)).toBeNull();
    await world.q(
      `INSERT INTO trip_entitlements (trip_id, boost_active, sponsored) VALUES ($1, true, false)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = true`,
      [world.a.tripId],
    );
    expect(await slot(world.a.organiser, `&trip_id=${world.a.tripId}`)).toBeNull();
    await world.q(
      "INSERT INTO user_entitlements (user_id, pass_plus, sources) VALUES ($1, true, '[]')",
      [world.b.organiser.uid],
    );
    expect(await slot(world.b.organiser)).toBeNull();
  });

  it('counts impressions and clicks with nobody attached, and stops at the cap', async () => {
    const opId = generateUuidV7();
    expect((await record('impression', opId)).status).toBe(200);
    await record('impression', opId);
    await record('click');
    const counts = await world.q<{ kind: string; count: string }>(
      'SELECT kind, count::text FROM sponsored_event_counts WHERE placement_id = $1 ORDER BY kind',
      [placement],
    );
    expect(counts).toEqual([
      { kind: 'click', count: '1' },
      { kind: 'impression', count: '1' },
    ]);
    const columns = await world.q<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'sponsored_event_counts'",
    );
    expect(columns.map((c) => c.column_name)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/user|device|trip/)]),
    );
    await record('impression');
    expect(await slot()).toBeNull();
    expect(
      errorOf(
        await world.harness.run(world.a.organiser, 'record_sponsored_event', {
          placement_id: generateUuidV7(),
          list_kind: 'search',
          kind: 'click',
        }),
      ).code,
    ).toBe('NOT_FOUND');
  });

  it('shows nothing while switched off', async () => {
    await world.q("UPDATE ops.ops_config SET value = 'false' WHERE key = 'explore.sponsored'");
    await world.q('DELETE FROM sponsored_event_counts');
    expect(await slot()).toBeNull();
  });
});
