/**
 * A meet-up activity when someone on it hides details on the lock screen, against a migrated
 * Postgres and the recorded fake APNs server: its frames and alerts reach the whole crew at once,
 * so every phone's copy shows the time and the crew but never the place.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
let meetupId: string;

beforeAll(async () => {
  world = await startLaWorld();
  // Every phone runs a build that draws the meet-up activity (it listed the kind in `la_kinds`).
  for (const [i, device] of world.devices.entries()) {
    await world.q(
      `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env, drawn)
       VALUES ($1, $2, 'meet_up', $3, 'sandbox', true)`,
      [device, world.trip.members[i], randomBytes(32).toString('hex')],
    );
  }
  const [meetup] = await world.q<{ id: string }>(
    `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
     VALUES ($1, 'Karsa Spa', -8.5069, 115.2625, $2, $3) RETURNING id`,
    [world.trip.tripId, new Date(world.now.getTime() + 20 * 60_000), world.trip.members[0]],
  );
  meetupId = meetup!.id;
  await world.q(
    `INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, true)
     ON CONFLICT (trip_id) DO UPDATE SET boost_active = true`,
    [world.trip.tripId],
  );
  await world.q(
    `INSERT INTO user_settings (user_id, hide_lockscreen_details) VALUES ($1, true)
     ON CONFLICT (user_id) DO UPDATE SET hide_lockscreen_details = true`,
    [world.trip.members[1]],
  );
  world.drain();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('la.orchestrate with details hidden on the lock screen', { timeout: 60_000 }, () => {
  it('starts the meet-up on every phone without its place', async () => {
    expect(await world.orchestrate('meet_up', meetupId)).toMatchObject({ outcome: 'sent' });
    const sent = world.drain();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.map(eventOf).every((event) => event === 'start')).toBe(true);
    expect(JSON.stringify(sent.map((r) => r.body))).not.toContain('Karsa');
    const aps = sent[0]!.body['aps'] as {
      attributes: Record<string, unknown>;
      alert: { title: string };
    };
    expect(aps.attributes).toMatchObject({ meetup_id: meetupId, place_name: '' });
    expect(aps.alert.title).toMatch(/^Meet-up · \d\d:\d\d$/u);
  });
});
