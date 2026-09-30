/**
 * Critter commands through the real `/v1/cmd` and `/sync/upload` doors against a migrated Postgres:
 * an egg hatches once whatever the trigger, and a dropout gets none; an encounter started,
 * sampled and befriended offline lands as a pending find with no name and a queued verification,
 * and a replayed batch changes nothing; guide skins need an owned form; reminders arm and cancel.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCritterCommands } from '../../src/commands/critters';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { buildCritterFixture, type CritterFixture } from './critters-fixture';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let fx: CritterFixture;

beforeAll(async () => {
  harness = await startCommandDoors(registerCritterCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  fx = await buildCritterFixture(harness);
}, 240_000);

afterAll(async () => {
  await producer.stop({ graceful: false });
  await harness.stop();
});

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function jobs(name: string): Promise<Record<string, unknown>[]> {
  const { rows } = await harness.pool.query<{ data: Record<string, unknown> }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [name],
  );
  return rows.map((row) => row.data);
}

async function upload(session: SignedIn, ops: unknown[]) {
  const response = await harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
  const body = (await response.json()) as { results: { status: string; code?: string }[] };
  return { status: response.status, results: body.results };
}

const evidence = {
  samples_hash: 'b'.repeat(64),
  dwell: { count: 30, mean_accuracy_m: 9, max_speed_mps: 1.1, duration_s: 320, inside_s: 305 },
  mock_flags: 0,
  device_ts: new Date().toISOString(),
};

describe('hatch_egg', () => {
  it('hatches a boarded traveller once, filing the starter form with its name', async () => {
    const opId = generateUuidV7();
    const first = await runCommand(
      harness,
      fx.maya,
      'hatch_egg',
      {
        trip_id: fx.tripId,
        trigger: 'manual',
      },
      { opId },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ result: { hatched: true, form_id: fx.starterFormId } });
    const replay = await runCommand(
      harness,
      fx.maya,
      'hatch_egg',
      {
        trip_id: fx.tripId,
        trigger: 'manual',
      },
      { opId },
    );
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await runCommand(harness, fx.maya, 'hatch_egg', {
      trip_id: fx.tripId,
      trigger: 'arrived',
    });
    expect(again.body).toMatchObject({ result: { hatched: false } });

    const eggs = await q<{ trigger: string }>(
      'SELECT trigger FROM eggs WHERE user_id = $1 AND trip_id = $2',
      [fx.maya.uid, fx.tripId],
    );
    expect(eggs).toEqual([{ trigger: 'manual' }]);
    const entries = await q<{ source: string; verification: string; critter_name: string }>(
      'SELECT source, verification, critter_name FROM collection_entries WHERE user_id = $1',
      [fx.maya.uid],
    );
    expect(entries).toEqual([{ source: 'hatch', verification: 'verified', critter_name: 'Chava' }]);
    const hatched = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'egg.hatched' AND trip_id = $1",
      [fx.tripId],
    );
    expect(hatched.rowCount).toBe(1);
    expect((await jobs('reward.fanout')).length).toBeGreaterThan(0);
  });

  it('gives a traveller who dropped out no egg', async () => {
    const result = await runCommand(harness, fx.dropout, 'hatch_egg', {
      trip_id: fx.tripId,
      trigger: 'arrived',
    });
    expect(result.status).toBe(403);
    expect(await q('SELECT 1 FROM eggs WHERE user_id = $1', [fx.dropout.uid])).toEqual([]);
  });
});

describe('an offline encounter', () => {
  it('lands as a pending find with a queued verification, and a replay changes nothing', async () => {
    const encounterId = generateUuidV7();
    const now = Date.now();
    const op = (cmd: string, payload: unknown) =>
      envelope(cmd, payload, { actor: { uid: fx.rin.uid, via: 'offline' } });
    const ops = [
      op('start_encounter', {
        encounter_id: encounterId,
        trip_id: fx.tripId,
        spawn_rule_id: fx.ruleId,
        poi_id: fx.poiId,
        started_at: new Date(now - 400_000).toISOString(),
        offline: true,
      }),
      op('report_encounter_samples', {
        encounter_id: encounterId,
        samples: [0, 1, 2].map((i) => ({
          at: new Date(now - 300_000 + i * 1000).toISOString(),
          distance_band: '10_25',
          accuracy_m: 9,
          speed_mps: 0.5,
        })),
        mock_flags: 0,
      }),
      op('befriend_critter', {
        encounter_id: encounterId,
        ready_at: new Date(now - 60_000).toISOString(),
        befriended_at: new Date(now - 50_000).toISOString(),
        via: 'accessible',
        evidence_bundle: evidence,
        attestation: { status: 'unavailable', reason: 'offline' },
      }),
    ];
    const first = await upload(fx.rin, ops);
    expect(first.status).toBe(200);
    expect(first.results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    const replay = await upload(fx.rin, ops);
    expect(replay.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);

    const encounters = await q<{ state: string; verification: string }>(
      'SELECT state, verification FROM encounters WHERE id = $1',
      [encounterId],
    );
    expect(encounters).toEqual([{ state: 'befriended', verification: 'pending' }]);
    expect(
      await q('SELECT 1 FROM encounter_samples WHERE encounter_id = $1', [encounterId]),
    ).toHaveLength(3);
    const entry = await q<{ verification: string; critter_name: string | null }>(
      'SELECT verification, critter_name FROM collection_entries WHERE encounter_id = $1',
      [encounterId],
    );
    expect(entry).toEqual([{ verification: 'pending', critter_name: null }]);
    expect(await jobs('critter.verify')).toContainEqual({ encounter_id: encounterId });
  });

  it("keeps one traveller's encounter away from another", async () => {
    const encounterId = generateUuidV7();
    await runCommand(harness, fx.maya, 'start_encounter', {
      encounter_id: encounterId,
      trip_id: fx.tripId,
      spawn_rule_id: fx.ruleId,
      poi_id: fx.poiId,
      started_at: new Date().toISOString(),
      offline: false,
    });
    const foreign = await runCommand(harness, fx.rin, 'report_encounter_samples', {
      encounter_id: encounterId,
      samples: [
        { at: new Date().toISOString(), distance_band: '0_10', accuracy_m: 5, speed_mps: 0 },
      ],
      mock_flags: 0,
    });
    expect(foreign.status).toBe(404);
  });

  it('refuses a spot that is not one of the rule’s places', async () => {
    const result = await runCommand(harness, fx.maya, 'start_encounter', {
      encounter_id: generateUuidV7(),
      trip_id: fx.tripId,
      spawn_rule_id: fx.ruleId,
      poi_id: null,
      started_at: new Date().toISOString(),
      offline: false,
    });
    expect(result.status).toBe(422);
  });
});

describe('set_guide_skin and set_explore_at_home', () => {
  it('dresses a guide only in an owned form, and reverts', async () => {
    const unowned = await runCommand(harness, fx.maya, 'set_guide_skin', {
      guide_id: fx.guideId,
      form_id: fx.rareFormId,
    });
    expect(unowned.status).toBe(403);
    const owned = await runCommand(harness, fx.maya, 'set_guide_skin', {
      guide_id: fx.guideId,
      form_id: fx.starterFormId,
    });
    expect(owned.status).toBe(200);
    expect(await q('SELECT 1 FROM guide_skins WHERE user_id = $1', [fx.maya.uid])).toHaveLength(1);
    await runCommand(harness, fx.maya, 'set_guide_skin', { guide_id: fx.guideId, form_id: null });
    expect(await q('SELECT 1 FROM guide_skins WHERE user_id = $1', [fx.maya.uid])).toHaveLength(0);
  });

  it('stores the explore-at-home opt-in', async () => {
    await runCommand(harness, fx.rin, 'set_explore_at_home', { on: true });
    expect(
      await q('SELECT explore_at_home FROM user_settings WHERE user_id = $1', [fx.rin.uid]),
    ).toEqual([{ explore_at_home: true }]);
  });
});

describe('set_legendary_reminder', () => {
  it('arms one reminder a month before the window and cancels it', async () => {
    const on = await runCommand(harness, fx.maya, 'set_legendary_reminder', {
      window_id: fx.windowId,
      on: true,
    });
    expect(on.status).toBe(200);
    await runCommand(harness, fx.maya, 'set_legendary_reminder', {
      window_id: fx.windowId,
      on: true,
    });
    const pending = await q<{ id: string; condition: { kind: string } }>(
      "SELECT id, condition FROM reminders WHERE user_id = $1 AND status = 'pending'",
      [fx.maya.uid],
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.condition.kind).toBe('window_active_not_found');
    const timers = await q<{ status: string; local: string }>(
      "SELECT status, to_char(local_at, 'MM-DD HH24:MI') AS local FROM scheduled_events WHERE ref_id = $1",
      [pending[0]?.id],
    );
    expect(timers[0]?.status).toBe('pending');
    expect(timers[0]?.local.endsWith('09:00')).toBe(true);

    await runCommand(harness, fx.maya, 'set_legendary_reminder', {
      window_id: fx.windowId,
      on: false,
    });
    expect(
      await q("SELECT 1 FROM reminders WHERE user_id = $1 AND status = 'pending'", [fx.maya.uid]),
    ).toEqual([]);
    expect(
      await q('SELECT status FROM scheduled_events WHERE ref_id = $1', [pending[0]?.id]),
    ).toEqual([{ status: 'cancelled' }]);
  });
});
