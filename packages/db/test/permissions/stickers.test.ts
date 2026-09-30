/**
 * `stickers` (C1): a member's own stickers (the Settled Tokek) are theirs to read and sync on `me`;
 * crew-wide stickers go to the crew on `crews`; only the server grants, and one Settled Tokek per
 * member per trip.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertTrip, insertTripParticipant } from '../helpers/actors';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('stickers', () => {
  it('shows a member their own stickers and syncs them on me', async () => {
    const { actors } = harness.fixture;
    const probe = "SELECT 1 FROM stickers WHERE kind = 'settled'";
    expect(await visibleRows(harness, actors.organiser, probe)).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('stickers')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('stickers') ?? []).toHaveLength(0);
  });

  it('shows crew-wide stickers to the crew only', async () => {
    const { crewId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "INSERT INTO stickers (crew_id, kind, granted_at) VALUES ($1, 'crew_level', now())",
        [crewId],
      ),
    );
    expect((await harness.rows('crews', 'member')).get('stickers')).toHaveLength(1);
    expect((await harness.rows('crews', 'exMember')).get('stickers') ?? []).toHaveLength(0);
  });

  it('is granted by the server only, once per member per trip', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    const grant =
      "INSERT INTO stickers (user_id, crew_id, trip_id, kind, granted_at) VALUES ($1, $2, $3, 'settled', now())";
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(grant, [actors.member, crewId, tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query(grant, [actors.organiser, crewId, tripId])),
    ).rejects.toThrow(/stickers_settled_once_uk/);
  });

  it('grants once, without a deadlock, when the last two payments clear at the same moment', async () => {
    const { actors, crewId } = harness.fixture;
    const { organiser, member, coOrganiser } = actors;
    const tripId = await withSystem(harness.db.pool, async (tx) => {
      const id = await insertTrip(tx, { crewId });
      for (const uid of [organiser, member, coOrganiser]) {
        await insertTripParticipant(tx, { tripId: id, userId: uid, rsvp: 'in' });
      }
      return id;
    });
    const entry = `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
        currency, source_kind, source_id)
      VALUES ($1, $2, $3, $4, 100, 'USD', $5, gen_random_uuid())`;
    // Two members each owe the organiser 1.00; each pays it back in its own transaction.
    await harness.db.pool.query(entry, [crewId, tripId, member, organiser, 'expense']);
    await harness.db.pool.query(entry, [crewId, tripId, coOrganiser, organiser, 'expense']);
    const confirm = async (payer: string) => {
      const client = await harness.db.pool.connect();
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_system');
      // The payment's entry takes a key share on the trip row before the grant locks it.
      await client.query(entry, [crewId, tripId, organiser, payer, 'payment']);
      return client;
    };
    const [first, second] = await Promise.all([confirm(member), confirm(coOrganiser)]);
    const grant = (client: typeof first) =>
      client
        .query<{ granted_user: string }>(
          'SELECT granted_user FROM app.grant_settled_if_square($1, now())',
          [tripId],
        )
        .then(async (result) => {
          await client.query('COMMIT');
          return result.rows.length;
        })
        .finally(() => client.release());
    const granted = await Promise.all([grant(first), grant(second)]);
    expect(granted.sort()).toEqual([0, 3]);
    const { rows } = await harness.db.pool.query<{ n: number; at: number }>(
      `SELECT count(*)::int AS n, count(DISTINCT granted_at)::int AS at FROM stickers
        WHERE trip_id = $1 AND kind = 'settled'`,
      [tripId],
    );
    expect(rows[0]).toEqual({ n: 3, at: 1 });
  });
});
