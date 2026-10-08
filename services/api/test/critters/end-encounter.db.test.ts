/**
 * Ending an encounter through the real `/v1/cmd` door against a migrated Postgres: the ring drains
 * and the critter wanders off, or the traveller walks away. Only the traveller's own active
 * encounter ends; the server keeps the longer dwell it already holds; a late end after the
 * encounter is over (wandered off, or befriended) changes nothing.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCritterCommands } from '../../src/commands/critters';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { buildCritterFixture, type CritterFixture } from './critters-fixture';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let fx: CritterFixture;

interface EncounterRow {
  state: string;
  dwell_s: number;
  resolved_at: Date | null;
  verification: string | null;
}

async function encounter(id: string): Promise<EncounterRow | undefined> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<EncounterRow>(
      'SELECT state, dwell_s, resolved_at, verification FROM encounters WHERE id = $1',
      [id],
    );
    return rows[0];
  });
}

async function start(who: SignedIn, startedAt = new Date(Date.now() - 400_000)): Promise<string> {
  const encounterId = generateUuidV7();
  const started = await runCommand(harness, who, 'start_encounter', {
    encounter_id: encounterId,
    trip_id: fx.tripId,
    spawn_rule_id: fx.ruleId,
    poi_id: fx.poiId,
    started_at: startedAt.toISOString(),
    offline: false,
  });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  return encounterId;
}

const end = (who: SignedIn, encounterId: string, payload: Record<string, unknown> = {}) =>
  runCommand(harness, who, 'end_encounter', {
    encounter_id: encounterId,
    outcome: 'wandered_off',
    ended_at: new Date().toISOString(),
    dwell_s: 0,
    ...payload,
  });

const errorCode = (response: { body: Record<string, unknown> }) =>
  (response.body['error'] as { code?: string; detail?: unknown } | undefined) ?? {};

beforeAll(async () => {
  harness = await startCommandDoors(registerCritterCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  // Befriending queues its verification in the same transaction.
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  fx = await buildCritterFixture(harness);
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

describe('end_encounter', () => {
  let wandered: string;
  const endedAt = new Date(Date.now() - 30_000).toISOString();

  it('is the traveller’s own: a crewmate and an unknown id find nothing', async () => {
    wandered = await start(fx.rin);
    const byCrewmate = await end(fx.maya, wandered);
    expect(byCrewmate.status).toBe(404);
    expect(errorCode(byCrewmate)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'encounter' },
    });
    const unknown = await end(fx.rin, generateUuidV7());
    expect(errorCode(unknown)).toMatchObject({ code: 'NOT_FOUND' });
    expect(await encounter(wandered)).toMatchObject({ state: 'accruing', resolved_at: null });
  });

  it('records the critter wandering off, when it did and how long the ring held', async () => {
    const ended = await end(fx.rin, wandered, { ended_at: endedAt, dwell_s: 212.6 });
    expect(ended.body['result']).toEqual({ encounter_id: wandered, ended: true });
    expect(await encounter(wandered)).toEqual({
      state: 'wandered_off',
      dwell_s: 213,
      resolved_at: new Date(endedAt),
      verification: null,
    });
  });

  it('changes nothing when it arrives again for an encounter already over', async () => {
    const late = await end(fx.rin, wandered, { outcome: 'abandoned', dwell_s: 900 });
    expect(late.body['result']).toEqual({ encounter_id: wandered, ended: false });
    expect(await encounter(wandered)).toMatchObject({
      state: 'wandered_off',
      dwell_s: 213,
      resolved_at: new Date(endedAt),
    });
  });

  it('keeps the longer dwell the server already holds when the traveller walks away', async () => {
    const abandoned = await start(fx.rin);
    await withSystem(harness.pool, (tx) =>
      tx.query('UPDATE encounters SET dwell_s = 300 WHERE id = $1', [abandoned]),
    );
    const ended = await end(fx.rin, abandoned, { outcome: 'abandoned', dwell_s: 120 });
    expect(ended.body['result']).toEqual({ encounter_id: abandoned, ended: true });
    expect(await encounter(abandoned)).toMatchObject({ state: 'abandoned', dwell_s: 300 });
  });

  it('leaves a befriended critter befriended', async () => {
    const now = Date.now();
    const befriended = await start(fx.rin, new Date(now - 400_000));
    const samples = await runCommand(harness, fx.rin, 'report_encounter_samples', {
      encounter_id: befriended,
      samples: [0, 1, 2].map((i) => ({
        at: new Date(now - 300_000 + i * 1000).toISOString(),
        distance_band: '10_25',
        accuracy_m: 9,
        speed_mps: 0.5,
      })),
      mock_flags: 0,
    });
    expect(samples.status, JSON.stringify(samples.body)).toBe(200);
    const friend = await runCommand(harness, fx.rin, 'befriend_critter', {
      encounter_id: befriended,
      ready_at: new Date(now - 60_000).toISOString(),
      befriended_at: new Date(now - 50_000).toISOString(),
      via: 'accessible',
      evidence_bundle: {
        samples_hash: 'b'.repeat(64),
        dwell: {
          count: 30,
          mean_accuracy_m: 9,
          max_speed_mps: 1.1,
          duration_s: 320,
          inside_s: 305,
        },
        mock_flags: 0,
        device_ts: new Date(now).toISOString(),
      },
      attestation: { status: 'unavailable', reason: 'offline' },
    });
    expect(friend.status, JSON.stringify(friend.body)).toBe(200);
    const before = await encounter(befriended);
    expect(before).toMatchObject({ state: 'befriended', verification: 'pending' });

    const late = await end(fx.rin, befriended, { dwell_s: 5000 });
    expect(late.body['result']).toEqual({ encounter_id: befriended, ended: false });
    expect(await encounter(befriended)).toEqual(before);
  });
});
