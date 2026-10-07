/**
 * Rebuilding a built recap from the console: only an owner may ask, the run is queued on the key
 * the normal path uses (so asking twice leaves one job), the recap stays `ready` while it waits,
 * each accepted request leaves one audit row, and a recap that does not exist or never got ready
 * is refused with nothing queued.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let boss: PgBoss;
let ops: string;
let owner: string;

const REASON = 'Got-away ranking fixed';

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  for (const queue of ['recap.build', 'recap.narrate']) {
    if ((await boss.getQueue(queue)) === null) await boss.createQueue(queue, { policy: 'stately' });
  }
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await boss?.stop();
  await app?.close();
  await harness?.stop();
});

/** A trip with a recap in `status` (a `ready` one has its numbers and words). */
async function recap(status: 'ready' | 'failed'): Promise<{ recapId: string; tripId: string }> {
  return withSystem(harness.pool, async (tx) => {
    const { rows: crews } = await tx.query<{ id: string }>(
      "INSERT INTO crews (name) VALUES ('Rebuild') RETURNING id",
    );
    const crewId = crews[0]!.id;
    const { rows: trips } = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    const tripId = trips[0]!.id;
    const built = status === 'ready' ? 1 : 0;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO recaps (trip_id, crew_id, status, version, copy_version, ready_at)
       VALUES ($1, $2, $3, $4, $4, CASE WHEN $3 = 'ready' THEN now() END) RETURNING id`,
      [tripId, crewId, status, built],
    );
    return { recapId: rows[0]!.id, tripId };
  });
}

async function jobs(queue: string, key: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 AND singleton_key = $2',
    [queue, key],
  );
  return rows.map((row) => row.data);
}

async function audits(recapId: string) {
  const { rows } = await harness.pool.query<{ reason: string; mode: string }>(
    `SELECT reason, detail ->> 'mode' AS mode FROM ops.admin_audit
      WHERE action = 'rebuild_recap' AND target_kind = 'recap' AND target_id = $1
      ORDER BY at`,
    [recapId],
  );
  return rows;
}

async function statusOf(recapId: string): Promise<string | undefined> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM recaps WHERE id = $1',
    [recapId],
  );
  return rows[0]?.status;
}

describe('recap rebuild in the console', () => {
  it('refuses an operator who is not an owner and queues nothing', async () => {
    const { recapId, tripId } = await recap('ready');
    const denied = await app.command(ops, 'rebuild_recap', {
      trip_id: tripId,
      mode: 'full',
      reason: REASON,
    });
    expect(denied.status).toBe(403);
    expect(await jobs('recap.build', `recap:${tripId}`)).toEqual([]);
    expect(await audits(recapId)).toEqual([]);
  });

  it('queues one build for a trip however often it is asked, and leaves the recap ready', async () => {
    const { recapId, tripId } = await recap('ready');
    const payload = { trip_id: tripId, mode: 'full', reason: REASON };

    const first = await app.command(owner, 'rebuild_recap', payload);
    expect(first.status).toBe(200);
    const again = await app.command(owner, 'rebuild_recap', payload);
    expect(again.status).toBe(200);

    expect(await jobs('recap.build', `recap:${tripId}`)).toEqual([
      { trip_id: tripId, reason: 'retry' },
    ]);
    expect(await jobs('recap.narrate', recapId)).toEqual([]);
    expect(await statusOf(recapId)).toBe('ready');
    expect(await audits(recapId)).toEqual([
      { reason: REASON, mode: 'full' },
      { reason: REASON, mode: 'full' },
    ]);
  });

  it('queues only the narration for a recap id in narration mode', async () => {
    const { recapId, tripId } = await recap('ready');
    const response = await app.command(owner, 'rebuild_recap', {
      recap_id: recapId,
      mode: 'narration',
      reason: 'Voice model changed',
    });
    expect(response.status).toBe(200);
    expect(await jobs('recap.narrate', recapId)).toEqual([{ recap_id: recapId }]);
    expect(await jobs('recap.build', `recap:${tripId}`)).toEqual([]);
    expect(await audits(recapId)).toEqual([{ reason: 'Voice model changed', mode: 'narration' }]);
  });

  it('refuses an unknown id, a recap that never got ready, and a payload naming both ids', async () => {
    const unknownTrip = randomUUID();
    const missing = await app.command(owner, 'rebuild_recap', {
      trip_id: unknownTrip,
      mode: 'full',
      reason: REASON,
    });
    expect(missing.status).toBe(404);
    expect(await jobs('recap.build', `recap:${unknownTrip}`)).toEqual([]);

    const failed = await recap('failed');
    const notReady = await app.command(owner, 'rebuild_recap', {
      recap_id: failed.recapId,
      mode: 'full',
      reason: REASON,
    });
    expect(notReady.status).toBe(409);
    expect(await jobs('recap.build', `recap:${failed.tripId}`)).toEqual([]);
    expect(await statusOf(failed.recapId)).toBe('failed');
    expect(await audits(failed.recapId)).toEqual([]);

    const ready = await recap('ready');
    const both = await app.command(owner, 'rebuild_recap', {
      recap_id: ready.recapId,
      trip_id: ready.tripId,
      mode: 'full',
      reason: REASON,
    });
    expect(both.status).toBe(422);
    expect(await audits(ready.recapId)).toEqual([]);
  });
});
