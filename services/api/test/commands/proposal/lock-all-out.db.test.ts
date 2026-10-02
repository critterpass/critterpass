/**
 * The organiser locks in alone once every recipient has said they can't make it, against a
 * migrated Postgres: while one recipient is unanswered or MAYBE the lock still needs someone IN;
 * when all of them are out it locks the proposal and confirms the trip with the organiser alone,
 * moving nobody.
 */
import { withSystem } from '@cp/db';
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

interface CommandBody {
  readonly result: Record<string, unknown>;
  readonly error: { code: string; detail: Record<string, unknown> };
}

let harness: CommandDoorsHarness;
let boss: PgBoss;
let organiser: SignedIn;
let members: SignedIn[];
let fx: ProposalFixture;
let proposalId: string;

const m = (n: number) => members[n - 1]!;

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
  return { status: response.status, body: (await response.json()) as CommandBody };
}

const tripStatus = async () =>
  (await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [fx.tripId]))[0]!.status;

const lock = () => run(organiser, 'lock_proposal', { proposal_id: proposalId });

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
  // Two crew members with seats seeded (unanswered), and one who joined with no reply yet.
  members = [];
  for (let i = 0; i < 3; i += 1) members.push(await harness.signInAnonymously());
  fx = await seedProposalTrip(harness.pool, organiser, members.slice(0, 2));
  await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
    fx.crewId,
    m(3).uid,
  ]);
  const created = await run(organiser, 'create_proposal', { trip_id: fx.tripId, config: {} });
  proposalId = created.body.result['proposal_id'] as string;
  expect((await run(organiser, 'send_proposal', { proposal_id: proposalId })).status).toBe(200);
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('lock_proposal when everyone else is out', () => {
  it('still needs someone IN while a recipient is unanswered or MAYBE', async () => {
    await run(m(1), 'set_rsvp', { proposal_id: proposalId, status: 'out' });
    await run(m(3), 'set_rsvp', { proposal_id: proposalId, status: 'out' });
    // m2 has not answered.
    const unanswered = await lock();
    expect(unanswered.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'nobody_in' },
    });
    await run(m(2), 'set_rsvp', { proposal_id: proposalId, status: 'maybe' });
    const maybe = await lock();
    expect(maybe.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'nobody_in' },
    });
    expect(await tripStatus()).toBe('proposed');
  });

  it('locks in with the organiser alone once every recipient is out', async () => {
    await run(m(2), 'set_rsvp', { proposal_id: proposalId, status: 'out' });
    const locked = await lock();
    expect(locked.status).toBe(200);
    expect(locked.body.result).toMatchObject({
      trip_status: 'confirmed',
      in: 0,
      waitlisted: 0,
      out: 3,
    });
    expect(await tripStatus()).toBe('confirmed');
    const [proposal] = await q<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [
      proposalId,
    ]);
    expect(proposal!.status).toBe('locked');
    const rows = await q<{ user_id: string; rsvp: string }>(
      'SELECT user_id, rsvp FROM trip_participants WHERE trip_id = $1 ORDER BY role, user_id',
      [fx.tripId],
    );
    expect(rows.filter((r) => r.user_id === organiser.uid)).toEqual([
      { user_id: organiser.uid, rsvp: 'in' },
    ]);
    expect(rows.filter((r) => r.user_id !== organiser.uid).map((r) => r.rsvp)).toEqual([
      'out',
      'out',
      'out',
    ]);
  });
});
