/**
 * SEND publishes the proposal's plan to the crew, against a migrated Postgres with row security on:
 * before SEND a member reads no plan days or items (the draft is the organiser's); after SEND the
 * member reads exactly the sent version's days and items, and an organiser draft that was never
 * sent stays invisible; after LOCK the version is `current` and a join on the trip's current
 * version (the one the trip-day jobs use) finds the trip's items.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerProposalCommands } from '../../../src/commands/proposal';
import { startJobProducer } from '../../../src/jobs/producer';
import { registerProposalRoutes } from '../../../src/routes/proposals';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';
import { seedProposalTrip, type ProposalFixture } from './fixture';

let harness: CommandDoorsHarness;
let boss: PgBoss;
let organiser: SignedIn;
let members: SignedIn[];
let fx: ProposalFixture;
let sentVersion: string;
let otherDraft: string;
let proposalId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** What `uid` can read of the trip's plan under row security. */
async function planAs(uid: string) {
  return withUser(harness.pool, uid, generateUuidV7(), async (tx) => {
    const days = await tx.query<{ version_id: string; day_no: number }>(
      'SELECT version_id, day_no FROM plan_days WHERE trip_id = $1 ORDER BY day_no',
      [fx.tripId],
    );
    const items = await tx.query<{ version_id: string; category: string }>(
      'SELECT version_id, category FROM plan_items WHERE trip_id = $1 ORDER BY category',
      [fx.tripId],
    );
    return { days: days.rows, items: items.rows };
  });
}

async function run(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, { op_id: generateUuidV7(), actor: { uid: who.uid, via: 'app' } }),
    ),
  });
  return {
    status: response.status,
    body: (await response.json()) as { result: Record<string, unknown> },
  };
}

/** An organiser-only draft version with one day and two items. */
async function seedDraft(categories: readonly [string, string]): Promise<string> {
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
  for (const category of categories) {
    await q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, tz, category, attendee_ids)
       VALUES ($1, $2, $3, $4, 'UTC', $5, ARRAY[$6::uuid])`,
      [version!.id, day!.id, fx.tripId, generateUuidV7(), category, organiser.uid],
    );
  }
  return version!.id;
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
  organiser = await harness.signInAnonymously();
  members = [];
  for (let i = 0; i < 4; i += 1) members.push(await harness.signInAnonymously());
  fx = await seedProposalTrip(harness.pool, organiser, members);
  otherDraft = await seedDraft(['rest', 'transfer']);
  sentVersion = await seedDraft(['food', 'sight']);
  await q('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [fx.tripId, sentVersion]);
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('the proposed plan and the crew', () => {
  it('is the organiser’s alone before SEND', async () => {
    const created = await run(organiser, 'create_proposal', { trip_id: fx.tripId, config: {} });
    proposalId = created.body.result['proposal_id'] as string;
    const [proposal] = await q<{ version_id: string }>(
      'SELECT version_id FROM proposals WHERE id = $1',
      [proposalId],
    );
    expect(proposal!.version_id).toBe(sentVersion);
    expect(await planAs(members[0]!.uid)).toEqual({ days: [], items: [] });
  });

  it('is readable by a member after SEND: exactly the sent version, never another draft', async () => {
    expect((await run(organiser, 'send_proposal', { proposal_id: proposalId })).status).toBe(200);
    const plan = await planAs(members[0]!.uid);
    expect(plan.days).toEqual([{ version_id: sentVersion, day_no: 1 }]);
    expect(plan.items).toEqual([
      { version_id: sentVersion, category: 'food' },
      { version_id: sentVersion, category: 'sight' },
    ]);
    const versions = await q<{ id: string; visibility: string; status: string }>(
      'SELECT id, visibility, status FROM itinerary_versions WHERE trip_id = $1',
      [fx.tripId],
    );
    expect(versions.find((v) => v.id === sentVersion)).toMatchObject({
      visibility: 'crew',
      status: 'proposed',
    });
    expect(versions.find((v) => v.id === otherDraft)).toMatchObject({
      visibility: 'organiser',
      status: 'draft',
    });
    const [trip] = await q<{ current_version_id: string }>(
      'SELECT current_version_id FROM trips WHERE id = $1',
      [fx.tripId],
    );
    expect(trip!.current_version_id).toBe(sentVersion);
  });

  it('is the trip’s current plan after LOCK, where the trip-day jobs find its items', async () => {
    await run(members[0]!, 'set_rsvp', { proposal_id: proposalId, status: 'in' });
    expect((await run(organiser, 'lock_proposal', { proposal_id: proposalId })).status).toBe(200);
    const [version] = await q<{ status: string; visibility: string }>(
      'SELECT status, visibility FROM itinerary_versions WHERE id = $1',
      [sentVersion],
    );
    expect(version).toEqual({ status: 'current', visibility: 'crew' });
    const items = await q<{ category: string }>(
      `SELECT i.category FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 ORDER BY i.category`,
      [fx.tripId],
    );
    expect(items.map((i) => i.category)).toEqual(['food', 'sight']);
  });
});
