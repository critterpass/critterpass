/**
 * Egg grants and landed hatches against a migrated Postgres: boarding grants each boarded
 * traveller one egg of the destination's starter form and a dropout none (taking back an unhatched
 * one); a landed leg hatches every traveller on it exactly once, except one with a connection
 * departing within a day, who hatches on the final leg.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { grantEggs } from '../../src/jobs/critters/grant-on-boarded';
import { hatchOnLanded } from '../../src/jobs/critters/hatch-on-landed';
import { startCritterWorld, type CritterWorld } from './critters-world';

let world: CritterWorld;

beforeAll(async () => {
  world = await startCritterWorld(3);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

const eggs = () =>
  world.q<{ user_id: string; form_id: string; hatched: boolean }>(
    'SELECT user_id, form_id, hatched_at IS NOT NULL AS hatched FROM eggs WHERE trip_id = $1 ORDER BY user_id',
    [world.tripId],
  );

async function flight(owner: string, travellers: string[], dep: string, arr: string, no: string) {
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
    [world.tripId, owner, travellers],
  );
  const [segment] = await world.q<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at)
     VALUES ($1, $2, $3, true, 'VN', $6, 'SGN', 'DAD', $4, $5) RETURNING id`,
    [booking?.id, world.tripId, owner, dep, arr, no],
  );
  return { booking: booking?.id as string, segment: segment?.id as string };
}

async function landed(ids: { booking: string; segment: string }, users: string[]): Promise<string> {
  return withSystem(world.harness.pool, async (tx) => {
    const event = await appendDomainEvent(tx, {
      type: 'flight.landed',
      aggregateKind: 'flight_segment',
      aggregateId: ids.segment,
      actorKind: 'system',
      actorId: null,
      crewId: world.crewId,
      tripId: world.tripId,
      payload: {
        trip_id: world.tripId,
        booking_id: ids.booking,
        segment_id: ids.segment,
        user_ids: users,
        source: 'provider',
      },
    });
    return event.id;
  });
}

describe('critter.grant_eggs', () => {
  it('grants one starter egg per boarded traveller, none to a dropout, and is idempotent', async () => {
    const [, , dev] = world.members as [string, string, string];
    await world.q("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
      world.tripId,
      dev,
    ]);
    expect(await grantEggs(world.harness.pool, { trip_id: world.tripId })).toEqual({
      granted: 2,
      withdrawn: 0,
    });
    expect(await grantEggs(world.harness.pool, { trip_id: world.tripId })).toEqual({
      granted: 0,
      withdrawn: 0,
    });
    const rows = await eggs();
    expect(rows.map((row) => row.user_id)).not.toContain(dev);
    expect(new Set(rows.map((row) => row.form_id))).toEqual(new Set([world.ids['form_common']]));
    const [participant] = await world.q<{ egg_id: string | null }>(
      'SELECT egg_id FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [world.tripId, world.members[0]],
    );
    expect(participant?.egg_id).not.toBeNull();
  });

  it('takes back the unhatched egg of someone who drops out', async () => {
    const [, rin] = world.members as [string, string];
    await world.q("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
      world.tripId,
      rin,
    ]);
    expect(await grantEggs(world.harness.pool, { trip_id: world.tripId })).toEqual({
      granted: 0,
      withdrawn: 1,
    });
    await world.q(
      "UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id IN ($2, $3)",
      [world.tripId, rin, world.members[2]],
    );
    expect((await grantEggs(world.harness.pool, { trip_id: world.tripId })).granted).toBe(2);
  });
});

describe('critter.hatch', () => {
  it('hatches everyone on the landed leg once, except a traveller with a connection', async () => {
    const [maya, rin, dev] = world.members as [string, string, string];
    const leg = await flight(
      maya,
      [maya, rin, dev],
      '2026-10-02T01:00:00Z',
      '2026-10-02T02:20:00Z',
      '120',
    );
    await flight(dev, [dev], '2026-10-02T05:00:00Z', '2026-10-02T06:00:00Z', '130');
    const event = await landed(leg, [maya, rin, dev]);
    expect(await hatchOnLanded(world.harness.pool, event)).toEqual({ hatched: 2 });
    expect(await hatchOnLanded(world.harness.pool, event)).toEqual({ hatched: 0 });
    const rows = await eggs();
    expect(
      rows
        .filter((row) => row.hatched)
        .map((row) => row.user_id)
        .sort(),
    ).toEqual([maya, rin].sort());
    const entries = await world.q<{ source: string; critter_name: string }>(
      "SELECT source, critter_name FROM collection_entries WHERE user_id = $1 AND source = 'hatch'",
      [maya],
    );
    expect(entries).toEqual([{ source: 'hatch', critter_name: 'Critter801' }]);
    const hatched = await world.harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'egg.hatched' AND trip_id = $1",
      [world.tripId],
    );
    expect(hatched.rowCount).toBe(2);
  });
});

describe('the egg starter', () => {
  it('is the set hero, and an unhatched egg granted before it follows; a hatched one stays', async () => {
    const [maya, , dev] = world.members as [string, string, string];
    // A lower-numbered critter with a common form joins the set: it must not become the starter.
    const [lower] = await world.q<{ form: string }>(
      `WITH c AS (
         INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
         SELECT 'cp-700', set_id, 700, 'Hanoi', 'Turtle', '{}', 7, 'Test.', release_id
           FROM critters WHERE key = 'cp-801'
         RETURNING id, release_id)
       INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
       SELECT 'cp-700:common', c.id, 'common', '{}', 'none', 'Test.', 'Be there', 10, c.release_id FROM c
       RETURNING id AS form`,
      [],
    );
    // Dev's egg was granted when the lower critter was the starter; Maya's has hatched.
    await world.q('UPDATE eggs SET form_id = $2 WHERE trip_id = $1 AND user_id = $3', [
      world.tripId,
      lower?.form,
      dev,
    ]);
    await world.q('UPDATE eggs SET form_id = $2 WHERE trip_id = $1 AND user_id = $3', [
      world.tripId,
      lower?.form,
      maya,
    ]);
    await grantEggs(world.harness.pool, { trip_id: world.tripId });
    const rows = await eggs();
    expect(rows.find((row) => row.user_id === dev)).toMatchObject({
      form_id: world.ids['form_common'],
      hatched: false,
    });
    expect(rows.find((row) => row.user_id === maya)).toMatchObject({
      form_id: lower?.form,
      hatched: true,
    });
  });
});
