/**
 * The critter-nearby activity against a migrated Postgres and the recorded fake APNs server:
 * - a dwell that begins with the app in the background is push-started on the traveller's phone,
 *   after a moment's wait for the app's own start, and never beside an activity the app started;
 * - the ring follows the reported samples (ten steps), drains once they wander off and ends on the
 *   catch with the found art; no position travels in any payload;
 * - a traveller whose phone cannot show it gets the notification instead.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { createKillSwitchReader, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LA_LOADERS, orchestrateObject } from '../../src/jobs/la';
import { critterNearbyNotification } from '../../src/jobs/la/critter-fallback';
import type { LaDeps } from '../../src/jobs/la/orchestrate';
import { createApnsProvider, createCopyRenderer } from '../../src/push';
import { startCritterWorld, type CritterWorld } from '../critters/critters-world';
import { startFakeApns, type ApnsRequest, type FakeApns } from '../push-servers';

const BUNDLE = 'app.critterpass';
const T0 = new Date(Math.floor(Date.now() / 60_000) * 60_000);
const at = (s: number) => new Date(T0.getTime() + s * 1000);

let world: CritterWorld;
let apns: FakeApns;
let provider: ReturnType<typeof createApnsProvider>;
let now = T0;
let seen = 0;
let device: string;
let encounterId: string;

const aps = (request: ApnsRequest) =>
  request.body['aps'] as {
    event?: string;
    'attributes-type'?: string;
    attributes?: Record<string, unknown>;
    'content-state': Record<string, unknown>;
    alert?: { title: string; body: string };
  };

function drain(): ApnsRequest[] {
  const fresh = apns.requests.slice(seen);
  seen = apns.requests.length;
  return fresh;
}

function run(refId: string) {
  const renderer = createCopyRenderer();
  const deps: LaDeps = {
    apns: provider,
    loaders: LA_LOADERS,
    render: (locale, copy, vars) => renderer.render(locale, copy, vars),
    switches: createKillSwitchReader(world.harness.pool, { tierOf: () => 'standard' }),
    defaultBundleId: BUNDLE,
    now: () => now,
  };
  return orchestrateObject(world.harness.pool, deps, 'critter_nearby', refId);
}

async function startEncounter(uid: string, createdAt: Date): Promise<string> {
  const id = randomUUID();
  await world.q(
    `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, poi_id, started_at,
       created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [
      id,
      uid,
      world.tripId,
      world.ids['ruleBridge'],
      world.ids['form_rare'],
      world.ids['bridge'],
      createdAt,
    ],
  );
  return id;
}

const samples = (id: string, uid: string, from: number, to: number, band: string) =>
  world.q(
    `INSERT INTO encounter_samples (encounter_id, user_id, at, distance_band, accuracy_m, speed_mps)
     SELECT $1, $2, $3::timestamptz + make_interval(secs => s), $4, 10, 0.5
       FROM generate_series($5::int, $6::int, 10) AS s`,
    [id, uid, T0, band, from, to],
  );

beforeAll(async () => {
  world = await startCritterWorld(2);
  apns = await startFakeApns();
  provider = createApnsProvider({
    credentials: apns.credentials,
    addresses: apns.addresses,
    rejectUnauthorized: false,
  });
  device = randomUUID();
  const quiet = randomUUID();
  for (const [id, uid, enabled] of [
    [device, world.members[0], true],
    [quiet, world.members[1], false],
  ] as const) {
    await world.q(
      `INSERT INTO devices (id, user_id, platform, bundle_id, app_version, locale, tz, la_enabled,
         la_frequent)
       VALUES ($1, $2, 'ios', $3, '1.0.0', 'en', 'Asia/Ho_Chi_Minh', $4, true)`,
      [id, uid, BUNDLE, enabled],
    );
  }
  await world.q(
    `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env, drawn)
     VALUES ($1, $2, 'critter_nearby', $3, 'sandbox', true)`,
    [device, world.members[0], randomBytes(32).toString('hex')],
  );
  encounterId = await startEncounter(world.members[0]!, T0);
}, 240_000);

afterAll(async () => {
  await provider?.shutdown();
  await apns?.close();
  await world?.stop();
});

describe('la.orchestrate critter nearby', { timeout: 60_000 }, () => {
  it('waits a moment for the app to report its own activity', async () => {
    now = at(5);
    expect(await run(encounterId)).toMatchObject({ outcome: 'sent', sends: 0, fallbacks: 0 });
    expect(drain()).toHaveLength(0);
  });

  it('never starts one beside the activity the app started itself', async () => {
    const [own] = await world.q<{ id: string }>(
      `INSERT INTO device_activities (device_id, user_id, trip_id, kind, ref_id, started_via, state)
       VALUES ($1, $2, $3, 'critter_nearby', $4, 'local', 'active') RETURNING id`,
      [device, world.members[0], world.tripId, world.ids['ruleBridge']],
    );
    now = at(40);
    expect(await run(encounterId)).toMatchObject({ outcome: 'sent', sends: 0 });
    expect(drain()).toHaveLength(0);
    await world.q('DELETE FROM device_activities WHERE id = $1', [own!.id]);
  });

  it('push-starts a background dwell with the confirmed ring and no position', async () => {
    await samples(encounterId, world.members[0]!, 0, 60, '10_25');
    now = at(65);
    expect(await run(encounterId)).toMatchObject({ outcome: 'sent', sends: 1, failed: 0 });
    const [start, ...rest] = drain();
    expect(rest).toHaveLength(0);
    expect(aps(start!).event).toBe('start');
    expect(aps(start!)['attributes-type']).toBe('CritterNearbyActivityAttributes');
    expect(aps(start!).attributes).toEqual({
      spawn_id: encounterId,
      silhouette_key: world.ids['form_rare'],
      place_name: 'Dragon Bridge',
    });
    expect(aps(start!)['content-state']).toMatchObject({
      state: 'dwelling',
      distance_band: 'close',
      ring: 2,
      blur_stage: 3,
      found_key: null,
      remain_min: 4,
    });
    expect(aps(start!).alert?.body).toBe('Stay at Dragon Bridge a little longer to meet them.');
    const wire = JSON.stringify(start!.body);
    expect(wire).not.toMatch(/"lat"|"lng"|16\.06|108\.2/);
    // Once started, a second run sends nothing new.
    expect(await run(encounterId)).toMatchObject({ outcome: 'sent', sends: 0 });
  });

  it('drains the ring after the traveller wanders off', async () => {
    await world.q(
      `UPDATE device_activities SET state = 'active', activity_push_token = $2, token_env = 'sandbox'
        WHERE kind = 'critter_nearby' AND ref_id = $1`,
      [encounterId, randomBytes(32).toString('hex')],
    );
    await samples(encounterId, world.members[0]!, 70, 70, '50_plus');
    // Left at 70 s with 70 s banked; a minute past the 90 s grace period takes 20 s off.
    now = at(70 + 90 + 60);
    drain();
    expect(await run(encounterId)).toMatchObject({ outcome: 'sent', sends: 1 });
    const [update] = drain();
    expect(aps(update!).event).toBe('update');
    expect(aps(update!)['content-state']).toMatchObject({
      state: 'draining',
      distance_band: 'near',
      ring: 1,
      remain_min: null,
    });
  });

  it('ends on the catch with the found art', async () => {
    await world.q(
      `UPDATE encounters SET state = 'befriended', verification = 'pending', resolved_at = $2
        WHERE id = $1`,
      [encounterId, now],
    );
    await run(encounterId);
    const [end, ...rest] = drain();
    expect(rest).toHaveLength(0);
    expect(aps(end!).event).toBe('end');
    expect(aps(end!)['content-state']).toMatchObject({
      state: 'caught',
      ring: 10,
      blur_stage: 0,
      found_key: world.ids['form_rare'],
    });
    expect(await run(encounterId)).toEqual({ outcome: 'idle' });
  });

  it('a phone gone silent loses the critter', async () => {
    const id = await startEncounter(world.members[0]!, at(1000));
    now = at(1000 + 30);
    expect(await run(id)).toMatchObject({ outcome: 'sent', sends: 1 });
    now = at(1000 + 16 * 60);
    await run(id);
    const [row] = await world.q<{ state: string; end_reason: string }>(
      "SELECT state, end_reason FROM device_activities WHERE kind = 'critter_nearby' AND ref_id = $1",
      [id],
    );
    expect(row).toEqual({ state: 'ended', end_reason: 'object_ended' });
    await world.q("UPDATE encounters SET state = 'abandoned', resolved_at = now() WHERE id = $1", [
      id,
    ]);
  });
});

describe('critter nearby notification', { timeout: 60_000 }, () => {
  const routed = (id: string, uid: string) => ({
    id: randomUUID(),
    type: 'encounter.started',
    payload: { trip_id: world.tripId, user_id: uid, encounter_id: id, spawn_rule_id: '' },
    crewId: world.crewId,
    tripId: world.tripId,
    actorId: uid,
    occurredAt: now,
  });

  it('goes only to a traveller whose phone cannot show the activity, and names no place', async () => {
    const quietId = await startEncounter(world.members[1]!, now);
    const shownId = await startEncounter(world.members[0]!, now);
    const result = await withSystem(world.harness.pool, async (tx) => ({
      quiet: await critterNearbyNotification.audience(tx, routed(quietId, world.members[1]!)),
      shown: await critterNearbyNotification.audience(tx, routed(shownId, world.members[0]!)),
      composed: await critterNearbyNotification.compose(
        tx,
        routed(quietId, world.members[1]!),
        world.members[1]!,
      ),
    }));
    expect(result.quiet).toEqual([world.members[1]]);
    expect(result.shown).toEqual([]);
    expect(result.composed).toMatchObject({
      title: { id: 'notifications.la.critter_start_title' },
      body: { id: 'notifications.la.critter_start_body_plain' },
      tripId: world.tripId,
    });
    expect(result.composed?.vars).toBeUndefined();
  });
});
