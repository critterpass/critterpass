/**
 * `trip_member_setup` (C1, RLS T): each setup member's part of setup as the crew sees it. The
 * recount (`app.recompute_member_setup`, also run by every availability recount) writes flags only:
 * whether their days in the setup range and their private max are in, never which days or how
 * much. Setup members only; clients read and never write it. Also `trips.sketched_days`: the days
 * of the organiser's private draft that hold a stop, kept at commit when the draft changes.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    await tx.query(
      `INSERT INTO calendar_days (user_id, date, state, source)
       VALUES ($1, current_date + 20, 'free', 'manual'), ($2, current_date + 20, 'unknown', 'manual'),
              ($3, current_date + 20, 'busy', 'manual')`,
      [actors.member, actors.coOrganiser, actors.outsider],
    );
    await tx.query(
      `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency, amount_trip_minor,
         trip_currency)
       VALUES ($1, $2, 120000, 'USD', 120000, 'USD')`,
      [tripId, actors.organiser],
    );
    await tx.query('SELECT app.recompute_member_setup($1)', [tripId]);
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function flags(): Promise<Map<string, { days_in: boolean; max_in: boolean }>> {
  const { actors, tripId } = harness.fixture;
  const { rows } = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
    tx.query<{ user_id: string; days_in: boolean; max_in: boolean }>(
      'SELECT user_id, days_in, max_in FROM trip_member_setup WHERE trip_id = $1',
      [tripId],
    ),
  );
  return new Map(rows.map((row) => [row.user_id, { days_in: row.days_in, max_in: row.max_in }]));
}

describe('trip_member_setup', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'trip_member_setup');
  });

  it('flags whose days and max are in, for setup members only', async () => {
    const { actors } = harness.fixture;
    const seen = await flags();
    expect(seen.get(actors.member)).toEqual({ days_in: true, max_in: false });
    expect(seen.get(actors.organiser)).toEqual({ days_in: false, max_in: true });
    // An unknown day is no answer.
    expect(seen.get(actors.coOrganiser)).toEqual({ days_in: false, max_in: false });
    expect(seen.has(actors.outsider)).toBe(false);
    expect(seen.has(actors.exMember)).toBe(false);
  });

  it('counts only days inside the locked dates once they are locked', async () => {
    const { actors, tripId } = harness.fixture;
    await withSystem(harness.db.pool, async (tx) => {
      await tx.query(
        'UPDATE trips SET start_date = current_date + 40, end_date = current_date + 44 WHERE id = $1',
        [tripId],
      );
      await tx.query('SELECT app.recompute_member_setup($1)', [tripId]);
    });
    expect((await flags()).get(actors.member)).toEqual({ days_in: false, max_in: false });
    await withSystem(harness.db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO calendar_days (user_id, date, state, source)
         VALUES ($1, current_date + 42, 'maybe', 'manual')`,
        [actors.member],
      );
      await tx.query('SELECT app.recompute_availability($1)', [tripId]);
    });
    expect((await flags()).get(actors.member)).toEqual({ days_in: true, max_in: false });
  });

  it('cannot be recounted by a client', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT app.recompute_member_setup($1)', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('trips.sketched_days', () => {
  it('names the draft days that hold a stop, once the draft is in place', async () => {
    const { actors, tripId } = harness.fixture;
    const sketched = await withSystem(harness.db.pool, async (tx) => {
      const version = await tx.query<{ id: string }>(
        `INSERT INTO itinerary_versions (trip_id, visibility, status, origin)
         VALUES ($1, 'organiser', 'draft', 'guide') RETURNING id`,
        [tripId],
      );
      const versionId = version.rows[0]!.id;
      for (const dayNo of [1, 2, 3]) {
        const day = await tx.query<{ id: string }>(
          `INSERT INTO plan_days (version_id, trip_id, day_no, date)
           VALUES ($1, $2, $3::int, current_date + 39 + $3::int) RETURNING id`,
          [versionId, tripId, dayNo],
        );
        if (dayNo !== 2) {
          await tx.query(
            'INSERT INTO plan_items (version_id, day_id, trip_id, category) VALUES ($1, $2, $3, $4)',
            [versionId, day.rows[0]!.id, tripId, 'sight'],
          );
        }
      }
      await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, versionId]);
      return versionId;
    });
    expect(sketched).toBeTruthy();
    const { rows } = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query<{ sketched_days: number[] }>('SELECT sketched_days FROM trips WHERE id = $1', [
        tripId,
      ]),
    );
    expect(rows[0]?.sketched_days).toEqual([1, 3]);
  });
});
