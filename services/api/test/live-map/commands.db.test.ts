/**
 * Crew live map commands against a migrated Postgres through `/v1/cmd`: the gate (Boost first,
 * then trip days), share windows that end at last-day midnight with their expiry timer, pause and
 * resume, one active meet-up, moves, pings, and replayed op ids that change nothing.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerLiveMapCommands } from '../../src/commands/live-map';
import { runCommand } from '../location/location-fixture';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { buildLiveMapFixture, setBoost, TRIP_TZ, type LiveMapFixture } from './live-map-fixture';

let harness: CommandDoorsHarness;
let fx: LiveMapFixture;
let unboosted: LiveMapFixture;
let planning: LiveMapFixture;

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** `domain_events` is closed to every app role; the suite reads it as the owner. */
async function events<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function outboxTypes(tripId: string): Promise<string[]> {
  const rows = await query<{ type: string }>(
    `SELECT payload->>'type' AS type FROM rt_outbox
      WHERE channel = 'trip_locations:' || $1 AND kind = 'publish' ORDER BY id`,
    [tripId],
  );
  return rows.map((row) => row.type);
}

beforeAll(async () => {
  harness = await startCommandDoors(registerLiveMapCommands);
  fx = await buildLiveMapFixture(harness);
  unboosted = await buildLiveMapFixture(harness);
  planning = await buildLiveMapFixture(harness, { inTripDays: false });
  await setBoost(harness.pool, fx.tripId, true);
  await setBoost(harness.pool, unboosted.tripId, false);
  await setBoost(harness.pool, planning.tripId, true);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('the crew-map gate', () => {
  it('answers ENTITLEMENT_REQUIRED on an unboosted trip', async () => {
    const res = await runCommand(harness, unboosted.maya, 'set_location_share', {
      trip_id: unboosted.tripId,
      status: 'on',
    });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('answers NOT_ELIGIBLE outside trip days and to people off the trip', async () => {
    const early = await runCommand(harness, planning.maya, 'create_meetup', {
      trip_id: planning.tripId,
      poi_id: planning.poiId,
      at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(early.body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    for (const who of [fx.bystander, fx.outsider]) {
      const res = await runCommand(harness, who, 'ping_all', { trip_id: fx.tripId, kind: 'ping' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    }
  });

  it('always lets someone turn sharing off, gate or not', async () => {
    const res = await runCommand(harness, unboosted.rin, 'set_location_share', {
      trip_id: unboosted.tripId,
      status: 'off',
    });
    expect(res.status).toBe(200);
  });
});

describe('set_location_share and pause_location_share', () => {
  let shareId: string;

  it('opens a share that ends at last-day midnight and arms its expiry', async () => {
    const opId = generateUuidV7();
    const on = await runCommand(
      harness,
      fx.maya,
      'set_location_share',
      { trip_id: fx.tripId, status: 'on' },
      { opId },
    );
    expect(on.status).toBe(200);
    const result = on.body['result'] as { share_id: string; ends_at: string };
    shareId = result.share_id;
    const [share] = await query<{ ends_at: Date; window_end: Date }>(
      'SELECT ends_at, app.crew_map_window_end(trip_id) AS window_end FROM location_shares WHERE id = $1',
      [shareId],
    );
    expect(share!.ends_at.toISOString()).toBe(share!.window_end.toISOString());
    // Asia/Makassar (UTC+8): local midnight is 16:00 UTC.
    expect(share!.ends_at.getUTCHours()).toBe(16);
    const timers = await query<{ tz: string; due_at: Date }>(
      "SELECT tz, due_at FROM scheduled_events WHERE kind = 'location.expire' AND ref_id = $1",
      [shareId],
    );
    expect(timers).toEqual([{ tz: TRIP_TZ, due_at: share!.ends_at }]);

    const replay = await runCommand(
      harness,
      fx.maya,
      'set_location_share',
      { trip_id: fx.tripId, status: 'on' },
      { opId },
    );
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await runCommand(harness, fx.maya, 'set_location_share', {
      trip_id: fx.tripId,
      status: 'on',
    });
    expect((again.body['result'] as { share_id: string }).share_id).toBe(shareId);
    const shares = await query('SELECT 1 FROM location_shares WHERE user_id = $1', [fx.maya.uid]);
    expect(shares).toHaveLength(1);
    expect(await outboxTypes(fx.tripId)).toEqual(['share.started']);
  });

  it('pauses at once and resumes, announcing both', async () => {
    const paused = await runCommand(harness, fx.maya, 'pause_location_share', {
      share_id: shareId,
      paused: true,
    });
    expect(paused.status).toBe(200);
    const [row] = await query<{ paused: boolean }>(
      'SELECT paused FROM location_shares WHERE id = $1',
      [shareId],
    );
    expect(row!.paused).toBe(true);
    await runCommand(harness, fx.maya, 'pause_location_share', {
      share_id: shareId,
      paused: false,
    });
    expect(await outboxTypes(fx.tripId)).toEqual([
      'share.started',
      'share.paused',
      'share.resumed',
    ]);
  });

  it('refuses to pause someone else’s share', async () => {
    const res = await runCommand(harness, fx.rin, 'pause_location_share', {
      share_id: shareId,
      paused: true,
    });
    expect(res.status).toBe(404);
  });

  it('ends the share on off', async () => {
    await runCommand(harness, fx.maya, 'set_location_share', { trip_id: fx.tripId, status: 'off' });
    const [row] = await query<{ open: boolean }>(
      'SELECT ends_at > now() AS open FROM location_shares WHERE id = $1',
      [shareId],
    );
    expect(row!.open).toBe(false);
    expect((await outboxTypes(fx.tripId)).at(-1)).toBe('share.ended');
    const changes = await events<{ change: string }>(
      `SELECT payload->>'change' AS change FROM domain_events
        WHERE type = 'location_share.changed' AND aggregate_id = $1 ORDER BY id`,
      [shareId],
    );
    expect(changes.map((c) => c.change)).toEqual(['on', 'paused', 'resumed', 'off']);
  });
});

describe('meet-ups and pings', () => {
  const meetupId = generateUuidV7();

  it('creates one active meet-up at a catalogue place and arms the ETA recount', async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const created = await runCommand(harness, fx.rin, 'create_meetup', {
      trip_id: fx.tripId,
      meetup_id: meetupId,
      poi_id: fx.poiId,
      at,
    });
    expect(created.status).toBe(200);
    expect(created.body['result']).toMatchObject({
      id: meetupId,
      place_name: 'Campuhan Ridge',
      poi_id: fx.poiId,
    });
    const replayed = await runCommand(harness, fx.rin, 'create_meetup', {
      trip_id: fx.tripId,
      meetup_id: meetupId,
      poi_id: fx.poiId,
      at,
    });
    expect((replayed.body['result'] as { id: string }).id).toBe(meetupId);
    const second = await runCommand(harness, fx.maya, 'create_meetup', {
      trip_id: fx.tripId,
      point: { lat: -8.51, lng: 115.26, name: 'Pin' },
      at,
    });
    expect(second.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
    const timers = await query(
      "SELECT 1 FROM scheduled_events WHERE kind = 'eta.meetups' AND ref_id = $1",
      [meetupId],
    );
    expect(timers).toHaveLength(1);
  });

  it('moves it to a dropped pin, clearing arrivals, and tells the crew', async () => {
    await query(`UPDATE meetups SET arrived = jsonb_build_object($2::text, now()) WHERE id = $1`, [
      meetupId,
      fx.maya.uid,
    ]);
    const moved = await runCommand(harness, fx.maya, 'move_meetup', {
      meetup_id: meetupId,
      point: { lat: -8.507, lng: 115.263, name: 'Ubud Palace gate' },
    });
    expect(moved.status).toBe(200);
    expect(moved.body['result']).toMatchObject({
      place_name: 'Ubud Palace gate',
      poi_id: null,
      arrived: {},
    });
    const moves = await events<{ type: string }>(
      "SELECT type FROM domain_events WHERE aggregate_id = $1 AND type LIKE 'meetup.%' ORDER BY id",
      [meetupId],
    );
    expect(moves.map((e) => e.type)).toEqual(['meetup.created', 'meetup.moved']);
  });

  it('refuses a move on an unboosted trip with ENTITLEMENT_REQUIRED', async () => {
    const [row] = await query<{ id: string }>(
      `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
       VALUES ($1, 'Warung', -8.5, 115.26, now(), $2) RETURNING id`,
      [unboosted.tripId, unboosted.maya.uid],
    );
    const res = await runCommand(harness, unboosted.rin, 'move_meetup', {
      meetup_id: row!.id,
      at: new Date().toISOString(),
    });
    expect(res.body).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('pings the crew with the sender’s own ETA on I’m on my way', async () => {
    await query(
      `INSERT INTO member_etas (trip_id, meetup_id, user_id, eta_min, sharing)
       VALUES ($1, $2, $3, 12, 'live')
       ON CONFLICT (trip_id, user_id) DO UPDATE SET meetup_id = $2, eta_min = 12`,
      [fx.tripId, meetupId, fx.rin.uid],
    );
    const res = await runCommand(harness, fx.rin, 'ping_all', {
      trip_id: fx.tripId,
      kind: 'on_my_way',
    });
    expect(res.status).toBe(200);
    expect(res.body['result']).toMatchObject({
      kind: 'on_my_way',
      eta_min: 12,
      place_name: 'Ubud Palace gate',
    });
    const [ping] = await events<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM domain_events WHERE type = 'crew.pinged' AND actor_id = $1",
      [fx.rin.uid],
    );
    expect(ping!.payload).toMatchObject({ kind: 'on_my_way', eta_min: 12, meetup_id: meetupId });
    expect((await outboxTypes(fx.tripId)).at(-1)).toBe('ping');
  });
});
