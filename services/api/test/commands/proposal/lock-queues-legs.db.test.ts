/**
 * Locking a plan in queues its legs, against a migrated Postgres: a crew of one locks the guide's
 * draft in alone, the command appends `proposal.locked` in its transaction, and the api's event
 * hook queues one debounced `plan.legs` run for the trip on the version that became the plan,
 * and one debounced `plan.check` run for the trip.
 */
import { onEventAppended, withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerProposalCommands } from '../../../src/commands/proposal';
import { startJobProducer } from '../../../src/jobs/producer';
import { planCheckEventHook } from '../../../src/planning/fit/check-hook';
import { legsEventHook } from '../../../src/planning/legs';
import { registerProposalRoutes } from '../../../src/routes/proposals';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let boss: PgBoss;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** A crew of one whose trip is in draft review on the organiser's one-day draft. */
async function seedTrip(organiser: SignedIn) {
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Lock Crew', $1) RETURNING id",
    [organiser.uid],
  );
  await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')", [
    crew!.id,
    organiser.uid,
  ]);
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew!.id],
  );
  const tripId = trip!.id;
  for (const status of ['won', 'setup', 'drafting', 'draft_review']) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  await q("UPDATE trips SET start_date = (now() + interval '60 days')::date WHERE id = $1", [
    tripId,
  ]);
  await q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, organiser.uid],
  );
  const [version] = await q<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'draft')
     RETURNING id`,
    [tripId],
  );
  const [day] = await q<{ id: string }>(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
     SELECT $1, id, 1, start_date, 'Arrival' FROM trips WHERE id = $2 RETURNING id`,
    [version!.id, tripId],
  );
  for (const category of ['food', 'sight']) {
    await q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, tz, category, attendee_ids)
       VALUES ($1, $2, $3, $4, 'UTC', $5, ARRAY[$6::uuid])`,
      [version!.id, day!.id, tripId, generateUuidV7(), category, organiser.uid],
    );
  }
  await q('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, version!.id]);
  return { tripId, versionId: version!.id };
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
  onEventAppended(legsEventHook);
  onEventAppended(planCheckEventHook);
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('lock_in_plan', () => {
  it('queues one legs run for the trip on the plan it locked in', async () => {
    const organiser = await harness.signInAnonymously();
    const trip = await seedTrip(organiser);
    const response = await harness.request('/v1/cmd/lock_in_plan', {
      method: 'POST',
      headers: { cookie: organiser.cookie },
      body: JSON.stringify(
        envelope(
          'lock_in_plan',
          { trip_id: trip.tripId },
          { op_id: generateUuidV7(), actor: { uid: organiser.uid, via: 'app' } },
        ),
      ),
    });
    expect(response.status).toBe(200);

    const locked = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'proposal.locked' AND trip_id = $1`,
      [trip.tripId],
    );
    expect(locked.rows[0]?.n).toBe(1);
    const { rows } = await harness.pool.query<{ data: unknown; key: string }>(
      `SELECT data, singleton_key AS key FROM pgboss.job
        WHERE name = 'plan.legs' AND data ->> 'trip_id' = $1`,
      [trip.tripId],
    );
    expect(rows).toEqual([
      { data: { trip_id: trip.tripId, version_id: trip.versionId }, key: `legs:${trip.tripId}` },
    ]);
    // The plan check too: the lock makes the draft the crew's plan without a new version.
    const checks = await harness.pool.query<{ data: unknown }>(
      "SELECT data FROM pgboss.job WHERE name = 'plan.check' AND data ->> 'trip_id' = $1",
      [trip.tripId],
    );
    expect(checks.rows).toEqual([{ data: { trip_id: trip.tripId, trigger: 'plan' } }]);
  });
});
