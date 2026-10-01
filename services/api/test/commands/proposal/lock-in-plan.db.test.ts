/**
 * Locking the plan in with nobody to send it to, against a migrated Postgres: a crew of one goes
 * from draft review to a confirmed trip on its plan (`current`, crew-visible, where a join on the
 * trip's current version finds its items) in one command; a friend who joins afterwards is seated
 * IN and reads that plan under row security; and with anyone to send it to the command is
 * refused, as locking a sent proposal with nobody IN still is.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { claimTripSeat } from '../../../src/commands/invites/seat-claim';
import { registerProposalCommands } from '../../../src/commands/proposal';
import { startJobProducer } from '../../../src/jobs/producer';
import { registerProposalRoutes } from '../../../src/routes/proposals';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';
import { seedProposalTrip } from './fixture';

interface Body {
  readonly result: Record<string, unknown>;
  readonly error: { code: string; detail: Record<string, unknown> };
}

let harness: CommandDoorsHarness;
let boss: PgBoss;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function run(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, { op_id: generateUuidV7(), actor: { uid: who.uid, via: 'app' } }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

/** A trip in draft review whose organiser's draft has one day and two stops. */
async function seedTrip(organiser: SignedIn, members: readonly SignedIn[]) {
  const fx = await seedProposalTrip(harness.pool, organiser, members);
  const [version] = await q<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'draft')
     RETURNING id`,
    [fx.tripId],
  );
  const [day] = await q<{ id: string }>(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
     SELECT $1, id, 1, start_date, 'Arrival' FROM trips WHERE id = $2 RETURNING id`,
    [version!.id, fx.tripId],
  );
  for (const category of ['food', 'sight']) {
    await q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, tz, category, attendee_ids)
       VALUES ($1, $2, $3, $4, 'UTC', $5, ARRAY[$6::uuid])`,
      [version!.id, day!.id, fx.tripId, generateUuidV7(), category, organiser.uid],
    );
  }
  await q('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [fx.tripId, version!.id]);
  return { ...fx, versionId: version!.id };
}

beforeAll(async () => {
  harness = await startCommandDoors(registerProposalCommands, (app, deps) =>
    registerProposalRoutes(app, deps),
  );
  boss = await startJobProducer({
    connectionString: (harness.pool.options as { connectionString: string }).connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('lock_in_plan', () => {
  it('confirms a crew of one on its plan, and a friend who joins later is in and reads it', async () => {
    const organiser = await harness.signInAnonymously();
    const trip = await seedTrip(organiser, []);
    const locked = await run(organiser, 'lock_in_plan', { trip_id: trip.tripId });
    expect(locked.status).toBe(200);
    expect(locked.body.result).toMatchObject({ trip_status: 'confirmed' });

    const [state] = await q<{ trip: string; version: string; visibility: string; current: string }>(
      `SELECT t.status AS trip, v.status AS version, v.visibility, t.current_version_id AS current
         FROM trips t JOIN itinerary_versions v ON v.id = t.current_version_id WHERE t.id = $1`,
      [trip.tripId],
    );
    expect(state).toEqual({
      trip: 'confirmed',
      version: 'current',
      visibility: 'crew',
      current: trip.versionId,
    });
    const items = await q<{ category: string }>(
      `SELECT i.category FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 ORDER BY i.category`,
      [trip.tripId],
    );
    expect(items.map((i) => i.category)).toEqual(['food', 'sight']);
    const pushes = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM messages WHERE trip_id = $1 AND type = 'proposal'`,
      [trip.tripId],
    );
    expect(pushes[0]!.n).toBe(0);

    // A friend joins the crew afterwards: seated IN on the confirmed trip, and reads the plan.
    const friend = await harness.signInAnonymously();
    await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
      trip.crewId,
      friend.uid,
    ]);
    const seat = await withSystem(harness.pool, (tx) => claimTripSeat(tx, trip.tripId, friend.uid));
    expect(seat.outcome).toBe('seated');
    const plan = await withUser(harness.pool, friend.uid, generateUuidV7(), async (tx) => {
      const rows = await tx.query<{ category: string }>(
        'SELECT category FROM plan_items WHERE trip_id = $1 ORDER BY category',
        [trip.tripId],
      );
      return rows.rows.map((r) => r.category);
    });
    expect(plan).toEqual(['food', 'sight']);
  });

  it('is refused with someone to send it to, and a sent proposal with nobody in still can’t lock', async () => {
    const organiser = await harness.signInAnonymously();
    const friend = await harness.signInAnonymously();
    const trip = await seedTrip(organiser, [friend]);
    const alone = await run(organiser, 'lock_in_plan', { trip_id: trip.tripId });
    expect(alone.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'has_recipients' },
    });
    const created = await run(organiser, 'create_proposal', { trip_id: trip.tripId, config: {} });
    const proposalId = created.body.result['proposal_id'] as string;
    await run(organiser, 'send_proposal', { proposal_id: proposalId });
    const early = await run(organiser, 'lock_proposal', { proposal_id: proposalId });
    expect(early.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'nobody_in' },
    });
    const [state] = await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
      trip.tripId,
    ]);
    expect(state!.status).toBe('proposed');
  });

  it('is organiser-only', async () => {
    const organiser = await harness.signInAnonymously();
    const friend = await harness.signInAnonymously();
    const trip = await seedTrip(organiser, [friend]);
    const denied = await run(friend, 'lock_in_plan', { trip_id: trip.tripId });
    expect(denied.status).toBe(403);
  });
});
