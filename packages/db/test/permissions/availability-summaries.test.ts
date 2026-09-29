/**
 * `availability_summaries` (C1, RLS T): per-date counts the crew may see, recomputed from the
 * owner-only days by `app.recompute_availability` (setup members only: an ex-member or outsider
 * never counts). Clients read, never write, and cannot run the recompute.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('availability_summaries', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'availability_summaries');
  });

  it('counts setup members only, with everyone silent as unknown', async () => {
    const { actors, tripId } = harness.fixture;
    await withSystem(harness.db.pool, async (tx) => {
      for (const [uid, state] of [
        [actors.member, 'free'],
        [actors.coOrganiser, 'maybe'],
        [actors.exMember, 'free'],
        [actors.outsider, 'free'],
      ] as const) {
        await tx.query(
          `INSERT INTO calendar_days (user_id, date, state, source)
           VALUES ($1, current_date + 30, $2, 'manual')`,
          [uid, state],
        );
      }
      await tx.query(
        `INSERT INTO calendar_days (user_id, date, state, source)
         VALUES ($1, current_date + 31, 'free', 'manual')`,
        [actors.member],
      );
      await tx.query(
        `INSERT INTO availability_summaries (trip_id, date, free_count, busy_count, unknown_count,
           member_count)
         VALUES ($1, current_date + 90, 3, 0, 0, 3)`,
        [tripId],
      );
      await tx.query('SELECT app.recompute_availability($1)', [tripId]);
    });
    const { rows } = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query<{
        offset: number;
        free_count: number;
        maybe_count: number;
        busy_count: number;
        unknown_count: number;
        member_count: number;
      }>(
        `SELECT date - current_date AS offset, free_count, maybe_count, busy_count, unknown_count,
                member_count
           FROM availability_summaries WHERE trip_id = $1 ORDER BY date`,
        [tripId],
      ),
    );
    expect(rows).toEqual([
      {
        offset: 30,
        free_count: 1,
        maybe_count: 1,
        busy_count: 1,
        unknown_count: 0,
        member_count: 3,
      },
      {
        offset: 31,
        free_count: 1,
        maybe_count: 0,
        busy_count: 0,
        unknown_count: 2,
        member_count: 3,
      },
    ]);
  });

  it('keeps the recompute to the server', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT app.recompute_availability($1)', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
