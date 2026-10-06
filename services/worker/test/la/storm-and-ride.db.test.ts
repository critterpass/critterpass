/**
 * The storm and ride activities against a migrated Postgres and the recorded fake APNs server, on
 * phones whose build draws both (`drawn` tokens):
 * - a weather watch over today push-starts on the whole crew with the watch list's words, turns
 *   into a warning when the plan needs a plan B, and ends as "passed" once it clears; a watch days
 *   away, or one about crowds, never starts one;
 * - a Grab fare someone checked push-starts on their phone only, gives way to the next fare they
 *   check and ends when the quote is half an hour old; the minute sweep picks both kinds up.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;

const aps = (request: { body: Record<string, unknown> }) =>
  request.body['aps'] as {
    'content-state': Record<string, unknown>;
    attributes?: Record<string, unknown>;
    alert?: { title: string; body: string };
  };

/** The phone reported the activity the server started: it now has its own update token. */
const activate = (kind: string, refId: string, device: string) =>
  world.q(
    `UPDATE device_activities SET state = 'active', activity_push_token = $4, token_env = 'sandbox'
      WHERE kind = $1 AND ref_id = $2 AND device_id = $3`,
    [kind, refId, device, randomBytes(32).toString('hex')],
  );

beforeAll(async () => {
  world = await startLaWorld();
  for (const [i, device] of world.devices.entries()) {
    for (const kind of ['storm', 'ride']) {
      await world.q(
        `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env, drawn)
         VALUES ($1, $2, $3, $4, 'sandbox', true)`,
        [device, world.trip.members[i], kind, randomBytes(32).toString('hex')],
      );
    }
  }
  world.drain();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('la.orchestrate storm', { timeout: 60_000 }, () => {
  let watchId: string;

  const watch = async (kind: string, target: string, daysAhead: number) => {
    const [row] = await world.q<{ id: string }>(
      `INSERT INTO watch_items (trip_id, kind, target_ref, day, status, score, title, detail)
       SELECT t.id, $2, $3, ($4::timestamptz AT TIME ZONE coalesce(t.tz, 'UTC'))::date + $5::int,
              'watching', 55, 'Heavy rain over the sunrise trek',
              'Pack a shell. We may move the trek to the afternoon.'
         FROM trips t WHERE t.id = $1 RETURNING id`,
      [world.trip.tripId, kind, target, world.now, daysAhead],
    );
    return row!.id;
  };

  it('push-starts a watch over today on the whole crew', async () => {
    const before = (await world.lifecycle()).queued;
    watchId = await watch('weather', 'day:today', 0);
    expect((await world.lifecycle()).queued).toBe(before + 1);
    expect(await world.orchestrate('storm', watchId)).toMatchObject({ outcome: 'sent', sends: 4 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['start', 'start', 'start', 'start']);
    expect(aps(sent[0]!).attributes).toEqual({ trip_id: world.trip.tripId, watch_id: watchId });
    const state = aps(sent[0]!)['content-state'];
    expect(state).toMatchObject({
      state: 'active',
      severity: 'watch',
      headline: 'Heavy rain over the sunrise trek',
      action_line: 'Pack a shell. We may move the trek to the afternoon.',
    });
    expect((state['window_end'] as number) - (state['window_start'] as number)).toBe(86_400);
    expect(aps(sent[0]!).alert).toMatchObject({ title: 'Heavy rain over the sunrise trek' });
  });

  it('never starts for a watch days away or one that is not weather', async () => {
    const before = (await world.lifecycle()).queued;
    const far = await watch('marine', 'day:later', 3);
    const crowds = await watch('crowds', 'day:crowds', 0);
    expect((await world.lifecycle()).queued).toBe(before);
    expect(await world.orchestrate('storm', far)).toEqual({ outcome: 'idle' });
    expect(await world.orchestrate('storm', crowds)).toEqual({ outcome: 'idle' });
    expect(world.drain()).toHaveLength(0);
  });

  it('becomes a warning when the plan needs a plan B', async () => {
    await activate('storm', watchId, world.devices[0]!);
    await world.q("UPDATE watch_items SET status = 'plan_b' WHERE id = $1", [watchId]);
    expect(await world.orchestrate('storm', watchId)).toMatchObject({ sends: 1 });
    const [update] = world.drain();
    expect(eventOf(update!)).toBe('update');
    expect(aps(update!)['content-state']).toMatchObject({ state: 'active', severity: 'warning' });
  });

  it('names no place when someone it reaches hides lock-screen details', async () => {
    await world.q(
      `INSERT INTO user_settings (user_id, hide_lockscreen_details) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET hide_lockscreen_details = true`,
      [world.trip.members[2]],
    );
    await world.orchestrate('storm', watchId);
    const [update] = world.drain();
    expect(aps(update!)['content-state']).toMatchObject({
      headline: 'Weather on watch',
      action_line: 'Open CritterPass to see the plan.',
    });
    await world.q('UPDATE user_settings SET hide_lockscreen_details = false WHERE user_id = $1', [
      world.trip.members[2],
    ]);
    await world.orchestrate('storm', watchId);
    world.drain();
  });

  it('ends as passed once the watch clears', async () => {
    await world.q("UPDATE watch_items SET status = 'go', resolved_at = $2 WHERE id = $1", [
      watchId,
      world.now,
    ]);
    await world.orchestrate('storm', watchId);
    const [end, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(eventOf(end!)).toBe('end');
    expect(aps(end!)['content-state']).toMatchObject({ state: 'passed' });
    expect(await world.orchestrate('storm', watchId)).toEqual({ outcome: 'idle' });
  });
});

describe('la.orchestrate ride', { timeout: 60_000 }, () => {
  let first: string;
  let second: string;
  let places: { id: string; name: string }[];

  const quote = async (fetchedAt: Date, etaMin: number) => {
    const [row] = await world.q<{ id: string }>(
      `INSERT INTO ride_quotes (trip_id, user_id, provider, from_poi_id, to_poi_id, service_name,
         fare_low_minor, fare_high_minor, currency, eta_min, surge, fetched_at)
       VALUES ($1, $2, 'grab', $3, $4, 'GrabCar', 4500, 6000, 'USD', $5, 'low', $6) RETURNING id`,
      [world.trip.tripId, world.trip.members[0], places[0]!.id, places[1]!.id, etaMin, fetchedAt],
    );
    return row!.id;
  };

  it('push-starts the fare on the phone of whoever checked it', async () => {
    places = await world.q('SELECT id, name FROM pois ORDER BY name LIMIT 2');
    const before = (await world.lifecycle()).queued;
    first = await quote(world.now, 6);
    expect((await world.lifecycle()).queued).toBe(before + 1);
    expect(await world.orchestrate('ride', first)).toMatchObject({ outcome: 'sent', sends: 1 });
    const [start, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(eventOf(start!)).toBe('start');
    expect(aps(start!).attributes).toEqual({
      trip_id: world.trip.tripId,
      quote_id: first,
      provider: 'grab',
      route: 'Mount Batur → Ngurah Rai Airport',
    });
    expect(aps(start!)['content-state']).toMatchObject({
      state: 'quoted',
      service_name: 'GrabCar',
      fare_low: 45,
      fare_high: 60,
      currency: 'USD',
      eta_min: 6,
      surge: true,
      deep_link: 'critterpass://getting-around',
    });
    expect(aps(start!).alert).toMatchObject({
      title: 'GrabCar · Mount Batur → Ngurah Rai Airport',
      body: 'About 6 min away. The fare is on your lock screen.',
    });
    expect(JSON.stringify(start!.body)).not.toMatch(/"lat"|"lng"/);
  });

  it('gives way to the next fare the traveller checks', async () => {
    await activate('ride', first, world.devices[0]!);
    second = await quote(new Date(world.now.getTime() + 60_000), 4);
    world.now = new Date(world.now.getTime() + 2 * 60_000);
    await world.orchestrate('ride', first);
    const [end, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(eventOf(end!)).toBe('end');
    expect(aps(end!)['content-state']).toMatchObject({ state: 'expired' });
    expect(await world.orchestrate('ride', second)).toMatchObject({ outcome: 'sent', sends: 1 });
    expect(world.drain().map(eventOf)).toEqual(['start']);
  });

  it('ends when the quote is half an hour old', async () => {
    await activate('ride', second, world.devices[0]!);
    world.now = new Date(world.now.getTime() + 30 * 60_000);
    await world.orchestrate('ride', second);
    const [end] = world.drain();
    expect(eventOf(end!)).toBe('end');
    expect(aps(end!)['content-state']).toMatchObject({ state: 'expired', eta_min: 4 });
    const live = await world.q(
      "SELECT 1 FROM device_activities WHERE kind = 'ride' AND state IN ('pending', 'active', 'stale')",
    );
    expect(live).toHaveLength(0);
  });
});
