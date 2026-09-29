/**
 * `trip_budget_aggregates` (C1, RLS T): the crew-level budget output. Below four maxes the row holds
 * a count and nothing else (CHECK), a band needs four maxes from current setup members and sits
 * strictly below the lowest (guard trigger), and the guide's context sees the band alone.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { insertCrewMember, insertUser, setCrewMemberStatus } from '../helpers/actors';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let fourth: string;

const MAXES = { organiser: 150_000, coOrganiser: 200_000, member: 180_000, fourth: 300_000 };

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, crewId, tripId } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    fourth = await insertUser(tx);
    await insertCrewMember(tx, { crewId, userId: fourth });
    for (const [uid, amount] of [
      [actors.coOrganiser, MAXES.coOrganiser],
      [actors.member, MAXES.member],
      [fourth, MAXES.fourth],
    ] as const) {
      await tx.query(
        `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency,
           amount_trip_minor, trip_currency) VALUES ($1, $2, $3, 'USD', $3, 'USD')`,
        [tripId, uid, amount],
      );
    }
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const writeBand = (count: number, high: number) =>
  withSystem(harness.db.pool, (tx) =>
    tx.query(
      `UPDATE trip_budget_aggregates
          SET maxes_count = $2, band_low_minor = 100000, band_high_minor = $3, step_minor = 5000,
              under_all_ok = true, infeasible = false
        WHERE trip_id = $1`,
      [harness.fixture.tripId, count, high],
    ),
  );

describe('trip_budget_aggregates', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'trip_budget_aggregates');
  });

  it('holds nothing but the count below four maxes', async () => {
    await expect(writeBand(3, 145_000)).rejects.toThrow(/check constraint/i);
  });

  it('never lets the band reach the lowest max, and lets a count move without re-banding', async () => {
    await expect(writeBand(4, MAXES.organiser)).rejects.toThrow(/below every max/);
    await expect(writeBand(4, MAXES.organiser + 5_000)).rejects.toThrow(/below every max/);
    await writeBand(4, 145_000);
    await withSystem(harness.db.pool, (tx) =>
      tx.query('UPDATE trip_budget_aggregates SET maxes_count = 5 WHERE trip_id = $1', [
        harness.fixture.tripId,
      ]),
    );
  });

  it('shows the band to the crew and the guide only from four maxes, never a max', async () => {
    const { actors, tripId } = harness.fixture;
    const band = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query<{ band: unknown }>('SELECT app.budget_band($1) AS band', [tripId]),
    );
    expect(band.rows[0]?.band).toEqual({ low_minor: 100000, high_minor: 145000, currency: 'USD' });
    const outsider = await withUser(harness.db.pool, actors.outsider, randomUUID(), (tx) =>
      tx.query<{ band: unknown }>('SELECT app.budget_band($1) AS band', [tripId]),
    );
    expect(outsider.rows[0]?.band).toBeNull();
    const context = await withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
      tx.query<{ budget_band: unknown }>('SELECT * FROM llm.trip_context'),
    );
    expect(context.rows[0]?.budget_band).toEqual({
      low_minor: 100000,
      high_minor: 145000,
      currency: 'USD',
    });
    const serialised = JSON.stringify(context.rows);
    for (const amount of Object.values(MAXES)) expect(serialised).not.toContain(String(amount));
  });

  it('refuses a band once a leaver takes the crew below four', async () => {
    const { crewId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      setCrewMemberStatus(tx, { crewId, userId: fourth, status: 'left' }),
    );
    await expect(writeBand(4, 140_000)).rejects.toThrow(/needs four maxes/);
  });
});
