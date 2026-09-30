/**
 * `start_trip` through the real `/v1/cmd` door against a migrated Postgres: only an organiser may
 * start the trip; a confirmed trip walks through pre-trip with one event per step; a replay answers
 * `started: false`; a proposed trip and a trip whose day-before has not come yet are refused.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerTripLifecycleCommands } from '../../src/commands/trips/lifecycle';
import { localDate } from '../critters/critters-fixture';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const TZ = 'Asia/Ho_Chi_Minh';
const PATH = ['won', 'setup', 'drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip'];

let harness: CommandDoorsHarness;
let organiser: SignedIn;
let member: SignedIn;
let crewId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function trip(status: string, startOffsetDays: number): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO trips (crew_id, status, tz, start_date, end_date)
     VALUES ($1, 'voting', $2, $3, $4) RETURNING id`,
    [crewId, TZ, localDate(TZ, startOffsetDays), localDate(TZ, startOffsetDays + 2)],
  );
  const tripId = (row as { id: string }).id;
  await q(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
     VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in')`,
    [tripId, organiser.uid, member.uid],
  );
  for (const step of PATH.slice(0, PATH.indexOf(status) + 1)) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, step]);
  }
  return tripId;
}

const status = async (tripId: string) =>
  (await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [tripId]))[0]?.status;

const moves = async (tripId: string) =>
  (
    await q<{ move: string }>(
      `SELECT (payload->>'from') || '->' || (payload->>'to') AS move FROM domain_events
        WHERE type = 'trip.status_changed' AND aggregate_id = $1 ORDER BY occurred_at, id`,
      [tripId],
    )
  ).map((row) => row.move);

beforeAll(async () => {
  harness = await startCommandDoors(registerTripLifecycleCommands);
  [organiser, member] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Start', $1) RETURNING id",
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
  await harness?.stop();
});

describe('start_trip', { timeout: 60_000 }, () => {
  it('lets only an organiser start the trip', async () => {
    const tripId = await trip('pre_trip', 0);
    const refused = await runCommand(harness, member, 'start_trip', { trip_id: tripId });
    expect(refused.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await status(tripId)).toBe('pre_trip');
    const started = await runCommand(harness, organiser, 'start_trip', { trip_id: tripId });
    expect(started.status).toBe(200);
    expect(await status(tripId)).toBe('in_trip');
  });

  it('walks a confirmed trip through pre-trip, and a second start changes nothing', async () => {
    const tripId = await trip('confirmed', 1);
    const first = await runCommand(harness, organiser, 'start_trip', { trip_id: tripId });
    expect(first.body).toMatchObject({
      result: { trip_id: tripId, status: 'in_trip', started: true },
    });
    const again = await runCommand(harness, organiser, 'start_trip', { trip_id: tripId });
    expect(again.body).toMatchObject({ result: { started: false } });
    expect(await moves(tripId)).toEqual(['confirmed->pre_trip', 'pre_trip->in_trip']);
  });

  it('refuses a proposed trip and one whose day-before has not come', async () => {
    const proposed = await trip('proposed', 0);
    const early = await trip('pre_trip', 5);
    for (const tripId of [proposed, early]) {
      const refused = await runCommand(harness, organiser, 'start_trip', { trip_id: tripId });
      expect(refused.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
      expect(await moves(tripId)).toEqual([]);
    }
  });
});
