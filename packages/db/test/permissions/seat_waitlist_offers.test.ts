/**
 * `seat_waitlist_offers`: RLS class T. The trip's crew reads the offers, only the offered member
 * answers theirs (status and response time only), the system alone creates them, and ex-members
 * lose sight of them with their membership. `app.lock_trip_seats` reports the trip only to its
 * crew. The trip stream mirrors the read boundary.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

function as(uid: string, sql: string, params: unknown[] = []) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));
}

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('seat_waitlist_offers', () => {
  it('shows the trip its offers and hides them from ex-members and strangers', async () => {
    const { actors, tripId } = harness.fixture;
    const sql = 'SELECT user_id FROM seat_waitlist_offers WHERE trip_id = $1';
    for (const uid of [actors.member, actors.organiser, actors.coOrganiser]) {
      expect((await as(uid, sql, [tripId])).rows).toEqual([{ user_id: actors.member }]);
    }
    for (const uid of [actors.exMember, actors.outsider, actors.anonymous]) {
      expect((await as(uid, sql, [tripId])).rows).toEqual([]);
    }
  });

  it('lets only the offered member answer, and only the answer columns', async () => {
    const { actors, tripId } = harness.fixture;
    const answer =
      "UPDATE seat_waitlist_offers SET status = 'declined', responded_at = now() WHERE trip_id = $1";
    expect((await as(actors.organiser, answer, [tripId])).rowCount).toBe(0);
    await expect(
      as(
        actors.member,
        "UPDATE seat_waitlist_offers SET expires_at = now() + interval '9 days' WHERE trip_id = $1",
        [tripId],
      ),
    ).rejects.toThrow(/permission denied/i);
    expect((await as(actors.member, answer, [tripId])).rowCount).toBe(1);
  });

  it('refuses app_user inserts and keeps one open offer per member and trip', async () => {
    const { actors, tripId } = harness.fixture;
    const offer = `INSERT INTO seat_waitlist_offers (trip_id, user_id, expires_at)
      VALUES ($1, $2, now() + interval '1 day')`;
    await expect(as(actors.organiser, offer, [tripId, actors.organiser])).rejects.toThrow(
      /permission denied/i,
    );
    await withSystem(harness.db.pool, (tx) => tx.query(offer, [tripId, actors.coOrganiser]));
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query(offer, [tripId, actors.coOrganiser])),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('syncs offers through the trip stream to crew members only', async () => {
    const { tripId } = harness.fixture;
    const member = await harness.rows('trip', 'member', { trip_id: tripId });
    expect((member.get('seat_waitlist_offers') ?? []).length).toBeGreaterThan(0);
    const exMember = await harness.rows('trip', 'exMember', { trip_id: tripId });
    expect(exMember.get('seat_waitlist_offers') ?? []).toEqual([]);
  });
});

describe('app.lock_trip_seats', () => {
  it('reports seats to the trip crew and nothing to anyone else', async () => {
    const { actors, tripId } = harness.fixture;
    const sql = 'SELECT seats_held, seat_cap, boost_active FROM app.lock_trip_seats($1)';
    expect((await as(actors.member, sql, [tripId])).rows).toEqual([
      { seats_held: 3, seat_cap: 6, boost_active: false },
    ]);
    expect((await as(actors.exMember, sql, [tripId])).rows).toEqual([]);
    expect((await as(actors.outsider, sql, [tripId])).rows).toEqual([]);
  });
});
