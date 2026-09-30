/**
 * The explore reads on the real stack: the destination guide re-priced for every crew airport
 * (each fare labelled with when it was seen), picks with at most one labelled sponsored slot only
 * where sponsored(u,t) holds (never for Pass+ or a boosted trip, never while switched off), and
 * the place context, whose Q&A line is the asking trip's own: crew B never receives crew A's line
 * about the same place, and an outsider's trip id is not found.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedFareCell } from '../travel-data/travel-seed';
import { startExploreWorld, type ExploreWorld } from './explore-world';

let world: ExploreWorld;
let month: string;

beforeAll(async () => {
  world = await startExploreWorld();
  const now = new Date();
  month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))
    .toISOString()
    .slice(0, 7);
  for (const origin of ['SIN', 'HAN']) {
    await seedFareCell(world.harness.pool, {
      origin,
      dest: 'KIX',
      destinationId: world.kyoto,
      month,
      priceMinor: origin === 'SIN' ? 41000 : 38000,
      fetchedAt: new Date(),
    });
  }
  await withSystem(world.harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO sponsored_placements
         (partner, poi_id, destination_id, list_kinds, starts_at, ends_at, created_by)
       VALUES ('klook', $1, $2, '{picks}', now() - interval '1 day', now() + interval '9 days', $3)`,
      [world.pois.stay, world.kyoto, world.a.organiser.uid],
    );
    await tx.query(
      `INSERT INTO place_qna_summaries (trip_id, poi_id, text, source_message_id, source_at)
       VALUES ($1, $2, 'Crew A wants the sunrise hike.', gen_random_uuid(), now() + interval '1 hour')`,
      [world.a.tripId, world.pois.mustSee],
    );
  });
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

const setFlag = (on: boolean) =>
  world.q("UPDATE ops.ops_config SET value = $1::jsonb WHERE key = 'explore.sponsored'", [
    JSON.stringify(on),
  ]);

type Entry = { kind: string; label?: string; item: { poi_id: string } };

async function picks(who = world.a.organiser, trip: string | null = world.a.tripId) {
  const query = trip === null ? `month=${month}` : `trip_id=${trip}&month=${month}`;
  const response = await world.get(who, `/v1/explore/destinations/${world.kyoto}?${query}`);
  expect(response.status).toBe(200);
  return response.body as { picks: Entry[]; fares: Record<string, unknown>[]; origins: unknown[] };
}

describe('destination guide', () => {
  it("prices the month from every crew member's airport, each fare labelled with when it was seen", async () => {
    const body = await picks();
    expect(body.origins).toEqual([
      { origin: 'HAN', user_ids: [world.a.members[1]!.uid] },
      { origin: 'SIN', user_ids: [world.a.organiser.uid] },
    ]);
    expect(body.fares.map((fare) => [fare['origin'], fare['state']])).toEqual([
      ['HAN', 'ok'],
      ['SIN', 'ok'],
    ]);
    for (const fare of body.fares) expect(typeof fare['seen_at']).toBe('string');
  });

  it('ranks the must-see first and shows no sponsored slot while switched off', async () => {
    await setFlag(false);
    const body = await picks();
    expect(body.picks[0]?.item.poi_id).toBe(world.pois.mustSee);
    expect(body.picks.map((entry) => entry.kind)).not.toContain('sponsored');
  });

  it('gives a free user exactly one labelled slot, third, and none to Pass+ or a boosted trip', async () => {
    await setFlag(true);
    const free = await picks();
    const slots = free.picks.filter((entry) => entry.kind === 'sponsored');
    expect(slots).toHaveLength(1);
    expect(free.picks[2]).toMatchObject({ kind: 'sponsored', label: 'SPONSORED' });
    expect(slots[0]?.item).toMatchObject({ poi_id: world.pois.stay, partner: 'klook' });
    expect(JSON.stringify(slots[0])).not.toMatch(/offer_ref|price|description/);

    await withSystem(world.harness.pool, (tx) =>
      tx.query(
        `INSERT INTO user_entitlements (user_id, pass_plus, sources) VALUES ($1, true, '[]')
         ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
        [world.a.members[1]!.uid],
      ),
    );
    const passPlus = await picks(world.a.members[1]);
    expect(passPlus.picks.map((entry) => entry.kind)).not.toContain('sponsored');
    expect((await picks(world.a.members[1], null)).picks.map((e) => e.kind)).not.toContain(
      'sponsored',
    );

    await withSystem(world.harness.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_entitlements (trip_id, boost_active, sponsored) VALUES ($1, true, false)
         ON CONFLICT (trip_id) DO UPDATE SET boost_active = true, sponsored = false`,
        [world.a.tripId],
      ),
    );
    const boosted = await picks();
    expect(boosted.picks.map((entry) => entry.kind)).not.toContain('sponsored');
    const withoutTrip = await picks(world.a.organiser, null);
    expect(withoutTrip.picks.filter((entry) => entry.kind === 'sponsored')).toHaveLength(1);
  });
});

describe('place context', () => {
  const context = (who = world.a.organiser, trip = world.a.tripId, poi = world.pois.mustSee) =>
    world.get(who, `/v1/places/${poi}/context?trip_id=${trip}`);

  it('gives crew A its own Q&A line and crew B none for the same place', async () => {
    const a = await context();
    expect(a.status).toBe(200);
    expect(a.body['qna']).toMatchObject({ text: 'Crew A wants the sunrise hike.' });
    const b = await context(world.b.organiser, world.b.tripId);
    expect(b.status).toBe(200);
    expect(b.body['qna']).toBeNull();
    expect(JSON.stringify(b.body)).not.toContain('Crew A');
    expect((await context(world.b.organiser, world.a.tripId)).status).toBe(404);
  });

  it('knows the stay, the organiser applies, a member proposes, and suggests a free slot', async () => {
    const organiser = await context();
    expect(organiser.body['stay']).toMatchObject({ estimate: true });
    expect(organiser.body['add_mode']).toBe('apply');
    expect(organiser.body['in_plan']).toBeNull();
    const slot = organiser.body['suggested_slot'] as { day_no: number; starts_at: string } | null;
    expect(slot).not.toBeNull();
    expect(slot?.day_no).toBe(3);
    const member = await context(world.a.members[1]);
    expect(member.body['add_mode']).toBe('changeset');
    const inPlan = await context(world.a.organiser, world.a.tripId, world.pois.stay);
    expect(inPlan.body['in_plan']).toMatchObject({ day_no: 1 });
    expect(inPlan.body['suggested_slot']).toBeNull();
  });

  it('lists crewmates who saved the place in the trip destination', async () => {
    await world.q("INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'poi', $2)", [
      world.a.members[1]!.uid,
      world.pois.mustSee,
    ]);
    const body = (await context()).body as { crew: { saved_by: string[] } };
    expect(body.crew.saved_by).toEqual([world.a.members[1]!.uid]);
    const other = (await context(world.b.organiser, world.b.tripId)).body as {
      crew: { saved_by: string[] };
    };
    expect(other.crew.saved_by).toEqual([]);
  });
});
