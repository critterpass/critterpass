/**
 * `delete_trip`, `cancel_trip` and `leave_trip` through the real `/v1/cmd` door against a migrated
 * Postgres: only an organiser deletes or cancels; deleting takes a lone setup trip out with every
 * row hanging off it and refuses one with others on it or a boost; cancelling moves the status,
 * closes open polls and an unanswered proposal, and hands the boost to the cancelled-trip move;
 * leaving is a decline that queues the dropout re-split, and an organiser may not leave.
 */
import { onEventAppended, withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { onTripChanged } from '../../src/billing/boost-lifecycle';
import { billingTripHook } from '../../src/billing/trip-hooks';
import { registerTripLifecycleCommands } from '../../src/commands/trips/lifecycle';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const PATH = ['won', 'setup', 'drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip'];

let harness: CommandDoorsHarness;
let boss: PgBoss;
let organiser: SignedIn;
let member: SignedIn;
let crewId: string;

// The owner connection: some rows (the event log, pg-boss) are not app_system's to read.
async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function trip(status: string, withMember = true): Promise<string> {
  const [row] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  const tripId = (row as { id: string }).id;
  await q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, organiser.uid],
  );
  if (withMember) {
    await q("INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')", [
      tripId,
      member.uid,
    ]);
  }
  for (const step of PATH.slice(0, PATH.indexOf(status) + 1)) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, step]);
  }
  return tripId;
}

const status = async (tripId: string) =>
  (await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [tripId]))[0]?.status;

const errorCode = (body: Record<string, unknown>) =>
  (body['error'] as { code?: string; detail?: { reason?: string } } | undefined) ?? {};

async function boost(tripId: string): Promise<void> {
  await q(
    `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at)
     VALUES ($1, $2, $3, 'promo', now(), now() + interval '180 days')`,
    [tripId, crewId, organiser.uid],
  );
}

beforeAll(async () => {
  harness = await startCommandDoors(registerTripLifecycleCommands);
  // The queues the commands and the billing hook send to, as the api creates them at boot.
  boss = await startJobProducer({
    connectionString: (harness.pool.options as { connectionString: string }).connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  onEventAppended(billingTripHook);
  [organiser, member] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Removal', $1) RETURNING id",
    [organiser.uid],
  );
  crewId = (crew as { id: string }).id;
  await q(
    `INSERT INTO crew_members (crew_id, user_id, role)
     VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
    [crewId, organiser.uid, member.uid],
  );
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('delete_trip', { timeout: 60_000 }, () => {
  it('removes a lone setup trip with every row hanging off it, cycles included', async () => {
    const tripId = await trip('setup', false);
    const [draft] = await q<{ id: string }>(
      'INSERT INTO itinerary_versions (trip_id) VALUES ($1) RETURNING id',
      [tripId],
    );
    const draftId = (draft as { id: string }).id;
    await q('INSERT INTO itinerary_versions (trip_id, parent_id) VALUES ($1, $2)', [
      tripId,
      draftId,
    ]);
    await q('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, draftId]);

    const refused = await runCommand(harness, member, 'delete_trip', { trip_id: tripId });
    expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(refused.body).code);

    const deleted = await runCommand(harness, organiser, 'delete_trip', { trip_id: tripId });
    expect(deleted.body).toMatchObject({ result: { trip_id: tripId, deleted: true } });
    expect(await status(tripId)).toBeUndefined();
    expect(await q('SELECT 1 FROM itinerary_versions WHERE trip_id = $1', [tripId])).toEqual([]);
    expect(await q('SELECT 1 FROM trip_participants WHERE trip_id = $1', [tripId])).toEqual([]);
  });

  it('refuses a trip someone else is on, a trip past setup, and one holding a boost', async () => {
    const shared = await trip('setup');
    const proposed = await trip('proposed', false);
    const boosted = await trip('setup', false);
    await boost(boosted);
    for (const [tripId, reason] of [
      [shared, 'others_on_trip'],
      [proposed, 'trip_status'],
      [boosted, 'has_records'],
    ] as const) {
      const refused = await runCommand(harness, organiser, 'delete_trip', { trip_id: tripId });
      expect(errorCode(refused.body)).toMatchObject({ code: 'STATE_INVALID', detail: { reason } });
      expect(await status(tripId)).toBeDefined();
    }
  });
});

describe('cancel_trip', { timeout: 60_000 }, () => {
  it('lets only an organiser cancel, closes open polls and the open proposal', async () => {
    const tripId = await trip('proposed');
    await q(
      `INSERT INTO polls (crew_id, trip_id, kind, question, created_by)
       VALUES ($1, $2, 'generic', 'Beach or hills?', $3)`,
      [crewId, tripId, organiser.uid],
    );
    await q(
      `INSERT INTO proposals (trip_id, created_by, reply_by, status)
       VALUES ($1, $2, now() + interval '2 days', 'sent')`,
      [tripId, organiser.uid],
    );

    const refused = await runCommand(harness, member, 'cancel_trip', { trip_id: tripId });
    expect(errorCode(refused.body).code).toBe('FORBIDDEN');
    expect(await status(tripId)).toBe('proposed');

    const first = await runCommand(harness, organiser, 'cancel_trip', { trip_id: tripId });
    expect(first.body).toMatchObject({ result: { status: 'cancelled', cancelled: true } });
    const again = await runCommand(harness, organiser, 'cancel_trip', { trip_id: tripId });
    expect(again.body).toMatchObject({ result: { cancelled: false } });

    const [trip_] = await q<{ status: string; cancelled: boolean }>(
      'SELECT status, cancelled_at IS NOT NULL AS cancelled FROM trips WHERE id = $1',
      [tripId],
    );
    expect(trip_).toEqual({ status: 'cancelled', cancelled: true });
    expect(await q('SELECT status FROM polls WHERE trip_id = $1', [tripId])).toEqual([
      { status: 'cancelled' },
    ]);
    expect(await q('SELECT status FROM proposals WHERE trip_id = $1', [tripId])).toEqual([
      { status: 'superseded' },
    ]);
    const moves = await q<{ move: string }>(
      `SELECT (payload->>'from') || '->' || (payload->>'to') AS move FROM domain_events
        WHERE type = 'trip.status_changed' AND aggregate_id = $1`,
      [tripId],
    );
    expect(moves.map((row) => row.move)).toContain('proposed->cancelled');
  });

  it('refuses a trip under way, and hands a boost to the cancelled-trip move', async () => {
    const started = await trip('pre_trip');
    await q("UPDATE trips SET status = 'in_trip' WHERE id = $1", [started]);
    const refused = await runCommand(harness, organiser, 'cancel_trip', { trip_id: started });
    expect(errorCode(refused.body)).toMatchObject({ code: 'STATE_INVALID' });

    const tripId = await trip('confirmed');
    await boost(tripId);
    const cancelled = await runCommand(harness, organiser, 'cancel_trip', { trip_id: tripId });
    expect(cancelled.status).toBe(200);
    const jobs = await q<{ data: { trip_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'boost.trip_changed' AND data->>'trip_id' = $1",
      [tripId],
    );
    expect(jobs).toHaveLength(1);
    await withSystem(harness.pool, (tx) => onTripChanged(tx, tripId, new Date()));
    const credits = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM boost_credits
        WHERE crew_id = $1 AND reason = 'trip_cancelled'`,
      [crewId],
    );
    const moved = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM trip_boosts WHERE source = 'moved' AND crew_id = $1`,
      [crewId],
    );
    // The crew has other trips planned from the tests above, so it moves; a credit otherwise.
    expect((credits[0]?.n ?? 0) + (moved[0]?.n ?? 0)).toBe(1);
    expect(
      await q("SELECT 1 FROM trip_boosts WHERE trip_id = $1 AND status = 'active'", [tripId]),
    ).toEqual([]);
  });
});

describe('leave_trip', { timeout: 60_000 }, () => {
  it('declines for a member, queueing the re-split, and refuses an organiser', async () => {
    const tripId = await trip('confirmed');
    const refused = await runCommand(harness, organiser, 'leave_trip', { trip_id: tripId });
    expect(errorCode(refused.body)).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'organiser_cancels' },
    });

    const left = await runCommand(harness, member, 'leave_trip', { trip_id: tripId });
    expect(left.body).toMatchObject({ result: { trip_id: tripId, rsvp: 'out' } });
    expect(
      await q('SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2', [
        tripId,
        member.uid,
      ]),
    ).toEqual([{ rsvp: 'out' }]);
    const dropouts = await q(
      "SELECT 1 FROM pgboss.job WHERE name = 'trip.dropout' AND data->>'trip_id' = $1",
      [tripId],
    );
    expect(dropouts).toHaveLength(1);
  });

  it('refuses once the trip has started', async () => {
    const tripId = await trip('pre_trip');
    await q("UPDATE trips SET status = 'in_trip' WHERE id = $1", [tripId]);
    const refused = await runCommand(harness, member, 'leave_trip', { trip_id: tripId });
    expect(errorCode(refused.body)).toMatchObject({ code: 'STATE_INVALID' });
  });
});
