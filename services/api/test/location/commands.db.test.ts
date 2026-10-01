/**
 * The permission mirror, consent and visit commands through the real `/v1/cmd` door, against a
 * migrated Postgres: consent is one row per purpose, the mirror is a no-op when unchanged, and a
 * visit is stored only with consent, plausible evidence and a POI in the trip's destination.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7, MOCK_FLAG_ACCESSORY, MOCK_FLAG_SIMULATED } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDeviceCommands } from '../../src/commands/device';
import { registerLocationCommands } from '../../src/commands/visits';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { buildLocationFixture, runCommand, type LocationFixture } from './location-fixture';

let harness: CommandDoorsHarness;
let fx: LocationFixture;

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerDeviceCommands(registry);
    registerLocationCommands(registry);
  });
  fx = await buildLocationFixture(harness);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** `domain_events` is closed to every service role; the owner connection reads it. */
async function events<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

describe('set_consent', () => {
  it('upserts one row per purpose, keeping the grant time when withdrawn', async () => {
    const grant = await runCommand(harness, fx.traveller, 'set_consent', {
      purpose: 'analytics',
      granted: true,
      copy_version: 'analytics-2026-09',
    });
    expect(grant.status).toBe(200);
    expect(grant.body).toMatchObject({ result: { purpose: 'analytics', granted: true } });
    await runCommand(harness, fx.traveller, 'set_consent', {
      purpose: 'analytics',
      granted: false,
    });
    await runCommand(harness, fx.traveller, 'set_consent', {
      purpose: 'marketing',
      granted: false,
    });

    const rows = await query<{ purpose: string; granted: boolean; revoked: boolean; copy: string }>(
      `SELECT purpose, granted_at IS NOT NULL AS granted, revoked_at IS NOT NULL AS revoked,
              copy_version AS copy
       FROM consents WHERE user_id = $1 ORDER BY purpose`,
      [fx.traveller.uid],
    );
    expect(rows).toEqual([
      { purpose: 'analytics', granted: true, revoked: true, copy: 'analytics-2026-09' },
      { purpose: 'marketing', granted: false, revoked: true, copy: null },
    ]);
  });

  it('refuses purposes the app cannot set', async () => {
    const result = await runCommand(harness, fx.traveller, 'set_consent', {
      purpose: 'faces',
      granted: true,
    });
    expect(result.status).toBe(422);
  });
});

describe('update_device_permissions', () => {
  it('mirrors a change once, stores it on the device and emits only derived capability', async () => {
    const deviceId = randomUUID();
    const registered = await runCommand(
      harness,
      fx.traveller,
      'register_device',
      { platform: 'ios', tz: 'Asia/Makassar', locale: 'en', app_version: '1.0.0' },
      { deviceId },
    );
    expect(registered.status).toBe(200);
    const perms = {
      notifications: 'provisional',
      location: 'granted',
      location_level: 'wiu',
      location_precise: true,
      la_enabled: true,
    };
    const first = await runCommand(
      harness,
      fx.traveller,
      'update_device_permissions',
      { perms },
      {
        deviceId,
      },
    );
    expect(first.body).toMatchObject({ result: { device_id: deviceId, changed: true } });
    const again = await runCommand(
      harness,
      fx.traveller,
      'update_device_permissions',
      { perms: { ...perms } },
      { deviceId },
    );
    expect(again.body).toMatchObject({ result: { changed: false } });

    const [device] = await query<{ permission_state: unknown; la_enabled: boolean }>(
      'SELECT permission_state, la_enabled FROM devices WHERE id = $1',
      [deviceId],
    );
    expect(device).toEqual({ permission_state: perms, la_enabled: true });
    const emitted = await events<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM domain_events WHERE type = 'device.permissions_changed' AND aggregate_id = $1",
      [deviceId],
    );
    expect(emitted).toEqual([
      {
        payload: {
          device_id: deviceId,
          push: 'quiet',
          can_ring: false,
          live_activities: true,
          encounters: 'session',
        },
      },
    ]);
  });

  it("rejects a device that is not the caller's", async () => {
    const result = await runCommand(harness, fx.crewmate, 'update_device_permissions', {
      perms: { camera: 'granted' },
    });
    expect(result.status).toBe(404);
  });
});

describe('record_visit and delete_visit', () => {
  const arrived = () => new Date(Date.now() - 30 * 60_000).toISOString();
  const left = () => new Date(Date.now() - 5 * 60_000).toISOString();
  const detected = (overrides: Record<string, unknown> = {}) => ({
    visit_id: generateUuidV7(),
    trip_id: fx.tripId,
    poi_id: fx.poiId,
    source: 'geofence',
    arrived_at: arrived(),
    left_at: left(),
    evidence: { dwell_s: 1200, acc: 12 },
    ...overrides,
  });

  it('refuses a detected visit without consent, and accepts a manual one', async () => {
    const refused = await runCommand(harness, fx.crewmate, 'record_visit', detected());
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const manual = await runCommand(harness, fx.crewmate, 'record_visit', {
      visit_id: generateUuidV7(),
      trip_id: fx.tripId,
      poi_id: fx.poiId,
      source: 'manual',
      arrived_at: arrived(),
    });
    expect(manual.status).toBe(200);
  });

  it('rejects software-simulated evidence and accepts an external GPS accessory', async () => {
    await runCommand(harness, fx.traveller, 'set_consent', {
      purpose: 'visit_detection',
      granted: true,
    });
    const simulated = await runCommand(
      harness,
      fx.traveller,
      'record_visit',
      detected({ evidence: { dwell_s: 1200, acc: 12, mock_flags: MOCK_FLAG_SIMULATED } }),
    );
    expect(simulated.status).toBe(422);
    expect(simulated.body).toMatchObject({ error: { code: 'LOCATION_IMPLAUSIBLE' } });
    const accessory = await runCommand(
      harness,
      fx.traveller,
      'record_visit',
      detected({ evidence: { dwell_s: 1200, acc: 12, mock_flags: MOCK_FLAG_ACCESSORY } }),
    );
    expect(accessory.status).toBe(200);
  });

  it('rejects a too-short dwell, a poor accuracy and a POI outside the trip destination', async () => {
    const short = await runCommand(
      harness,
      fx.traveller,
      'record_visit',
      detected({ evidence: { dwell_s: 20, acc: 12 } }),
    );
    expect(short.body).toMatchObject({ error: { code: 'LOCATION_IMPLAUSIBLE' } });
    const blurry = await runCommand(
      harness,
      fx.traveller,
      'record_visit',
      detected({ evidence: { dwell_s: 600, acc: 400 } }),
    );
    expect(blurry.body).toMatchObject({ error: { code: 'LOCATION_IMPLAUSIBLE' } });
    const elsewhere = await runCommand(
      harness,
      fx.traveller,
      'record_visit',
      detected({ poi_id: fx.elsewherePoiId }),
    );
    expect(elsewhere.status).toBe(422);
    expect(elsewhere.body).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('treats a replayed op as a no-op and closes an open visit with the same id', async () => {
    const opId = generateUuidV7();
    const open = detected({ left_at: undefined });
    const first = await runCommand(harness, fx.traveller, 'record_visit', open, { opId });
    const replay = await runCommand(harness, fx.traveller, 'record_visit', open, { opId });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const closedAt = left();
    await runCommand(harness, fx.traveller, 'record_visit', { ...open, left_at: closedAt });
    const rows = await query<{ left_at: Date | null }>('SELECT left_at FROM visits WHERE id = $1', [
      open.visit_id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.left_at?.toISOString()).toBe(closedAt);
    const recorded = await events(
      "SELECT 1 FROM domain_events WHERE type = 'visit.recorded' AND aggregate_id = $1",
      [open.visit_id],
    );
    expect(recorded).toHaveLength(1);
  });

  it('refuses a non-participant, and deletes only the caller’s own visit', async () => {
    const outsider = await harness.signInAnonymously();
    const refused = await runCommand(harness, outsider, 'record_visit', {
      ...detected(),
      source: 'manual',
    });
    expect(refused.status).toBe(403);

    const visit = detected();
    await runCommand(harness, fx.traveller, 'record_visit', visit);
    const byOther = await runCommand(harness, fx.crewmate, 'delete_visit', {
      visit_id: visit.visit_id,
    });
    expect(byOther.body).toMatchObject({ result: { deleted: false } });
    const byOwner = await runCommand(harness, fx.traveller, 'delete_visit', {
      visit_id: visit.visit_id,
    });
    expect(byOwner.body).toMatchObject({ result: { deleted: true } });
    expect(await query('SELECT 1 FROM visits WHERE id = $1', [visit.visit_id])).toEqual([]);
  });
});
