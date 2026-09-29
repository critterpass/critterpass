/**
 * `redraft_reservations` (C1): organisers read the trip's reservations, directly and on the
 * trip_draft stream; nobody writes one as `app_user` (the redraft commands and the worker write
 * them as app_system); a settled reservation never changes again. Also the `redrafts` view and the
 * silent redraft fair-use counter.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let jobId: string;
let reservationId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, actors } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    const job = await tx.query<{ id: string }>(
      "INSERT INTO agent_jobs (trip_id, user_id, kind, status) VALUES ($1, $2, 'redraft', 'running') RETURNING id",
      [tripId, actors.organiser],
    );
    jobId = job.rows[0]?.id as string;
    const reservation = await tx.query<{ id: string }>(
      "INSERT INTO redraft_reservations (trip_id, agent_job_id, quota_period_key) VALUES ($1, $2, 'lifetime') RETURNING id",
      [tripId, jobId],
    );
    reservationId = reservation.rows[0]?.id as string;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('redraft_reservations', () => {
  it('is read by organisers only, directly and through sync', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM redraft_reservations WHERE id = $1';
    for (const kind of ['organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [reservationId]), kind).toBe(1);
    }
    for (const kind of ['member', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [reservationId]), kind).toBe(0);
      const synced = await harness.rows('trip_draft', kind, { trip_id: tripId });
      expect(synced.get('redraft_reservations') ?? [], kind).toHaveLength(0);
    }
    const organiser = await harness.rows('trip_draft', 'organiser', { trip_id: tripId });
    expect(organiser.get('redraft_reservations')?.map((row) => row.id)).toContain(reservationId);
  });

  it('is never written by app_user', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      as(
        actors.organiser,
        'INSERT INTO redraft_reservations (trip_id, agent_job_id) VALUES ($1, $2)',
        [tripId, jobId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.organiser, "UPDATE redraft_reservations SET status = 'released' WHERE id = $1", [
        reservationId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('settles once: a committed reservation cannot be released', async () => {
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "UPDATE redraft_reservations SET status = 'committed', settled_at = now() WHERE id = $1",
        [reservationId],
      ),
    );
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query("UPDATE redraft_reservations SET status = 'released' WHERE id = $1", [
          reservationId,
        ]),
      ),
    ).rejects.toThrow(/already committed/);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          "UPDATE redraft_reservations SET status = 'reserved', settled_at = NULL WHERE id = $1",
          [reservationId],
        ),
      ),
    ).rejects.toThrow(/already committed/);
  });

  it('joins its job in the redrafts view, under the caller’s own RLS', async () => {
    const { actors } = harness.fixture;
    const view = 'SELECT reservation_status FROM redrafts WHERE redraft_id = $1';
    const { rows } = await as(actors.organiser, view, [jobId]);
    expect(rows).toEqual([{ reservation_status: 'committed' }]);
    expect(await visibleRows(harness, actors.member, view, [jobId])).toBe(0);
  });

  it('counts redrafts in the silent fair-use counter', async () => {
    const { actors } = harness.fixture;
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query<{ bump: { count: number; cap: number } }>(
        "SELECT app.bump_fair_use($1, 'redrafts', date_trunc('day', now()), 20) AS bump",
        [actors.organiser],
      ),
    );
    expect(rows[0]?.bump).toEqual({ count: 1, cap: 20 });
  });
});
