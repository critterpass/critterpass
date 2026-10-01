/**
 * The flight-day activity against a migrated Postgres and the recorded fake APNs server, for a leg
 * that only has its schedule (no live status ever arrives): it push-starts three hours before
 * departure, reads departed once the departure time has passed, ends two hours after the landing
 * time and is never started again.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
let segmentId: string;
let departs: Date;
let lands: Date;
const updateToken = 'cd'.repeat(32);

const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
const stateOf = (body: Record<string, unknown>) =>
  (body['aps'] as { 'content-state': Record<string, unknown> })['content-state'];
const rows = () =>
  world.q<{ state: string; end_reason: string | null }>(
    'SELECT state, end_reason FROM device_activities WHERE ref_id = $1 ORDER BY started_at',
    [segmentId],
  );

beforeAll(async () => {
  world = await startLaWorld();
  const owner = world.trip.members[0]!;
  departs = at(world.now, 170);
  lands = at(departs, 85);
  await world.q(
    `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
     VALUES ($1, $2, 'flight', $3, 'sandbox')`,
    [world.devices[0], owner, randomBytes(32).toString('hex')],
  );
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
    [world.trip.tripId, owner, [owner]],
  );
  const [segment] = await world.q<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at, boarding_at)
     VALUES ($1, $2, $3, true, '9G', '956', 'SGN', 'DAD', $4, $5, $6) RETURNING id`,
    [booking!.id, world.trip.tripId, owner, departs, lands, at(departs, -40)],
  );
  segmentId = segment!.id;
  world.drain();
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('la.orchestrate flight on schedule only', { timeout: 60_000 }, () => {
  it('push-starts the traveller three hours before departure', async () => {
    world.now = at(departs, -181);
    expect(await world.orchestrate('flight', segmentId)).toEqual({ outcome: 'idle' });
    world.now = at(departs, -170);
    expect(await world.orchestrate('flight', segmentId)).toMatchObject({
      outcome: 'sent',
      sends: 1,
    });
    const [start] = world.drain();
    expect(eventOf(start!)).toBe('start');
    expect(stateOf(start!.body)).toMatchObject({ phase: 'check_in' });
    const aps = start!.body['aps'] as { attributes: Record<string, unknown> };
    expect(aps.attributes).toMatchObject({ flight_no: '9G 956', from: 'SGN', to: 'DAD' });
  });

  it('reads departed after the departure time when nobody reported it', async () => {
    // The phone has shown the activity and handed over its update token.
    await world.q(
      `UPDATE device_activities SET state = 'active', activity_push_token = $2, token_env = 'sandbox'
        WHERE ref_id = $1`,
      [segmentId, updateToken],
    );
    world.now = at(departs, -20);
    await world.orchestrate('flight', segmentId);
    expect(world.drain().map((r) => stateOf(r.body)['phase'])).toEqual(['boarding']);

    world.now = at(departs, 20);
    await world.orchestrate('flight', segmentId);
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['update']);
    expect(stateOf(sent[0]!.body)).toMatchObject({ phase: 'departed' });
  });

  it('ends two hours after the landing time and never starts again', async () => {
    world.now = at(lands, 119);
    await world.orchestrate('flight', segmentId);
    expect(world.drain().filter((r) => eventOf(r) === 'end')).toHaveLength(0);

    world.now = at(lands, 121);
    await world.orchestrate('flight', segmentId);
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['end']);
    expect(sent[0]!.path.endsWith(`/${updateToken}`)).toBe(true);
    expect(await rows()).toEqual([{ state: 'ended', end_reason: 'object_ended' }]);

    // Hours later the clock still runs the sweep: nothing restarts, nothing is sent.
    world.now = at(lands, 600);
    await world.lifecycle();
    expect(await world.orchestrate('flight', segmentId)).toEqual({ outcome: 'idle' });
    expect(world.drain()).toHaveLength(0);
    expect(await rows()).toEqual([{ state: 'ended', end_reason: 'object_ended' }]);
  });
});
