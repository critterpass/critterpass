/**
 * `budget_max_private` (C3, RLS X, write-only): a member writes their own max for a trip of their
 * crew and nobody reads it back through app_user — not the organiser, not a crewmate, not even its
 * owner. The owner's only read is `app.my_budget_max`, which answers about the caller alone.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

const INSERT_MAX = `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency,
  amount_trip_minor, trip_currency) VALUES ($1, $2, 90000, 'USD', 90000, 'USD')`;

describe('budget_max_private', () => {
  it('is readable by nobody through app_user, its owner included', async () => {
    await expectSealed(harness, 'budget_max_private', { owner: null });
    const { organiser } = harness.fixture.actors;
    await expect(as(organiser, 'SELECT amount_minor FROM budget_max_private')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('lets a crew member write only their own max, only on their own trip', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(as(actors.member, INSERT_MAX, [tripId, actors.coOrganiser])).rejects.toThrow(
      /row-level security/i,
    );
    await expect(as(actors.outsider, INSERT_MAX, [tripId, actors.outsider])).rejects.toThrow(
      /row-level security/i,
    );
    await expect(as(actors.exMember, INSERT_MAX, [tripId, actors.exMember])).rejects.toThrow(
      /row-level security/i,
    );
    await as(actors.member, INSERT_MAX, [tripId, actors.member]);
  });

  it('answers app.my_budget_max about the caller only', async () => {
    const { actors, tripId } = harness.fixture;
    const own = await as(actors.organiser, 'SELECT * FROM app.my_budget_max($1)', [tripId]);
    expect(own.rows).toEqual([
      expect.objectContaining({ amount_minor: '150000', currency: 'USD', source: 'entered' }),
    ]);
    // The member's own max (written above) is theirs alone; the organiser's stays the organiser's.
    const theirs = await as(actors.coOrganiser, 'SELECT * FROM app.my_budget_max($1)', [tripId]);
    expect(theirs.rows).toEqual([]);
    const outsider = await as(actors.outsider, 'SELECT * FROM app.my_budget_max($1)', [tripId]);
    expect(outsider.rows).toEqual([]);
  });
});
