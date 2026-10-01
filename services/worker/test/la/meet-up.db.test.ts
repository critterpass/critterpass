/**
 * The crew-live (meet-up) activity against a migrated Postgres and the recorded fake APNs server:
 * a boosted trip's meet-up half an hour out push-starts on every member's phone that can show it,
 * with no coordinates in any payload; a straggler's new ETA is one broadcast; a lapsed Boost ends it
 * everywhere with "boost ended" as the final frame and never starts it again.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, isBroadcast, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
let meetupId: string;

const boost = (on: boolean) =>
  world.q(
    `INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, $2)
     ON CONFLICT (trip_id) DO UPDATE SET boost_active = EXCLUDED.boost_active`,
    [world.trip.tripId, on],
  );

const eta = (member: number, minutes: number, metres: number) =>
  world.q(
    `INSERT INTO member_etas (trip_id, meetup_id, user_id, eta_min, distance_m, sharing)
     VALUES ($1, $2, $3, $4, $5, 'live')
     ON CONFLICT (trip_id, user_id) DO UPDATE
       SET eta_min = EXCLUDED.eta_min, distance_m = EXCLUDED.distance_m`,
    [world.trip.tripId, meetupId, world.trip.members[member], minutes, metres],
  );

beforeAll(async () => {
  world = await startLaWorld();
  // Alex's phone has Live Activities off; the others hold a meet-up push-to-start token.
  await world.q('UPDATE devices SET la_enabled = false WHERE id = $1', [world.devices[3]]);
  for (const [i, device] of world.devices.entries()) {
    await world.q(
      `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
       VALUES ($1, $2, 'meet_up', $3, 'sandbox')`,
      [device, world.trip.members[i], randomBytes(32).toString('hex')],
    );
  }
  const [meetup] = await world.q<{ id: string }>(
    `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
     VALUES ($1, 'Karsa Spa', -8.5069, 115.2625, $2, $3) RETURNING id`,
    [world.trip.tripId, new Date(world.now.getTime() + 20 * 60_000), world.trip.members[0]],
  );
  meetupId = meetup!.id;
  // Maya, Dev and Alex are already there; Rin is the one still on the way.
  await world.q('UPDATE meetups SET arrived = $2 WHERE id = $1', [
    meetupId,
    Object.fromEntries([0, 2, 3].map((i) => [world.trip.members[i], world.now.toISOString()])),
  ]);
  await eta(1, 22, 2400);
  await boost(true);
  world.drain();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('la.orchestrate meet-up', { timeout: 60_000 }, () => {
  it('push-starts the crew on a boosted trip, without a coordinate in sight', async () => {
    const result = await world.orchestrate('meet_up', meetupId);
    expect(result).toMatchObject({ outcome: 'sent', sends: 3, fallbacks: 1 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['start', 'start', 'start']);
    const text = JSON.stringify(sent.map((r) => r.body));
    expect(text).not.toMatch(/-8\.50|115\.26|"lat"|"lng"/);
    const aps = sent[0]!.body['aps'] as { attributes: Record<string, unknown> };
    expect(aps.attributes).toMatchObject({ meetup_id: meetupId, place_name: 'Karsa Spa' });
  });

  it('a straggler moving closer is one broadcast', async () => {
    await eta(1, 6, 600);
    expect(await world.orchestrate('meet_up', meetupId)).toMatchObject({ sends: 1 });
    const [update, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(isBroadcast(update!)).toBe(true);
    const state = (update!.body['aps'] as { 'content-state': { stragglers: unknown[] } })[
      'content-state'
    ];
    expect(state.stragglers).toEqual([expect.objectContaining({ line: '600 m · 6 min' })]);
  });

  it('a lapsed Boost ends it everywhere with the reason, and nothing starts again', async () => {
    await boost(false);
    expect(await world.orchestrate('meet_up', meetupId)).toMatchObject({ outcome: 'sent' });
    const [end, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(eventOf(end!)).toBe('end');
    const final = (end!.body['aps'] as { 'content-state': Record<string, unknown> })[
      'content-state'
    ];
    expect(final).toMatchObject({ state: 'ended', end_reason: 'boost_ended' });
    expect(await world.orchestrate('meet_up', meetupId)).toEqual({ outcome: 'idle' });
    expect(world.drain()).toHaveLength(0);
  });
});
