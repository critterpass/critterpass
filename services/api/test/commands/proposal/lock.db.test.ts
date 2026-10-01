/**
 * Sending posts the proposal's card in crew chat once, and the organiser's lock confirms the trip
 * against a migrated Postgres: only the organiser may lock, never before a recipient is IN; the
 * lock waitlists every MAYBE, moves everyone who never answered out, releases the open activity
 * holds of those now off the trip (keeping the IN members'), locks the proposal and moves the trip
 * `proposed → confirmed` with its event. Locking again changes nothing.
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
  readonly status?: string;
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

async function run(who: SignedIn, cmd: string, payload: unknown, opId = generateUuidV7()) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, { op_id: opId, actor: { uid: who.uid, via: 'app' } }),
    ),
  });
  return { status: response.status, body: (await response.json()) as CommandBody };
}

/** `domain_events` is read as the pool's owner: the system role has no read grant on it. */
const confirmedEvents = async () =>
  (
    await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events WHERE type = 'trip.status_changed'
          AND aggregate_id = $1 AND payload->>'to' = 'confirmed'`,
      [fx.tripId],
    )
  ).rows[0]!.n;

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
  const [hold] = await q<{ id: string }>(
    `INSERT INTO supplier_orders (trip_id, buyer_id, supplier, partner_cart_ref)
     VALUES ($1, $2, 'viator', 'cart-lock-member') RETURNING id`,
    [fx.tripId, m(3).uid],
  );
  await q(
    `UPDATE supplier_orders SET status = 'holding', availability_status = 'HOLDING',
            hold_valid_until = now() + interval '20 minutes' WHERE id = $1`,
    [hold!.id],
  );
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('send_proposal', () => {
  it('posts the proposal card in crew chat once', async () => {
    const created = await run(organiser, 'create_proposal', { trip_id: fx.tripId, config: {} });
    proposalId = created.body.result['proposal_id'] as string;
    const opId = generateUuidV7();
    expect((await run(organiser, 'send_proposal', { proposal_id: proposalId }, opId)).status).toBe(
      200,
    );
    await run(organiser, 'send_proposal', { proposal_id: proposalId });
    const cards = await q<{ trip_id: string; sender_id: string }>(
      `SELECT trip_id, sender_id FROM messages
        WHERE type = 'proposal' AND ref_kind = 'proposal' AND ref_id = $1`,
      [proposalId],
    );
    expect(cards).toEqual([{ trip_id: fx.tripId, sender_id: organiser.uid }]);
  });
});

describe('lock_proposal', () => {
  it('is organiser-only and needs someone IN', async () => {
    const denied = await run(m(1), 'lock_proposal', { proposal_id: proposalId });
    expect(denied.status).toBe(403);
    const early = await run(organiser, 'lock_proposal', { proposal_id: proposalId });
    expect(early.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'nobody_in' },
    });
    const [trip] = await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
      fx.tripId,
    ]);
    expect(trip!.status).toBe('proposed');
  });

  it('waitlists maybes, moves the unanswered out, releases their holds and confirms the trip', async () => {
    expect((await run(m(1), 'set_rsvp', { proposal_id: proposalId, status: 'in' })).status).toBe(
      200,
    );
    await run(m(2), 'set_rsvp', { proposal_id: proposalId, status: 'maybe' });
    // Reply-by may already have locked the proposal without confirming the trip (too few IN at
    // the time): the organiser's lock still goes through.
    await q("UPDATE proposals SET status = 'locked', locked_at = now() WHERE id = $1", [
      proposalId,
    ]);
    const locked = await run(organiser, 'lock_proposal', { proposal_id: proposalId });
    expect(locked.status).toBe(200);
    expect(locked.body.result).toEqual({
      proposal_id: proposalId,
      trip_status: 'confirmed',
      in: 1,
      waitlisted: 1,
      out: 2,
    });

    const rsvps = await q<{ user_id: string; rsvp: string; waitlist_position: number | null }>(
      'SELECT user_id, rsvp, waitlist_position FROM trip_participants WHERE trip_id = $1',
      [fx.tripId],
    );
    const of = (uid: string) => rsvps.find((r) => r.user_id === uid);
    expect(of(m(1).uid)).toMatchObject({ rsvp: 'in' });
    expect(of(m(2).uid)?.rsvp).toBe('waitlisted');
    expect(of(m(2).uid)?.waitlist_position).toBeGreaterThan(0);
    expect(of(m(3).uid)?.rsvp).toBe('out');
    expect(of(m(4).uid)?.rsvp).toBe('out');

    const orders = await q<{ buyer_id: string; status: string }>(
      'SELECT buyer_id, status FROM supplier_orders WHERE trip_id = $1',
      [fx.tripId],
    );
    expect(orders.find((o) => o.buyer_id === m(3).uid)?.status).toBe('released');
    expect(orders.find((o) => o.buyer_id === organiser.uid)?.status).toBe('holding');

    const [state] = await q<{ trip: string; proposal: string; locked: boolean }>(
      `SELECT t.status AS trip, p.status AS proposal, p.locked_at IS NOT NULL AS locked
         FROM trips t JOIN proposals p ON p.trip_id = t.id WHERE p.id = $1`,
      [proposalId],
    );
    expect(state).toEqual({ trip: 'confirmed', proposal: 'locked', locked: true });
    expect(await confirmedEvents()).toBe(1);
  });

  it('changes nothing when locked again', async () => {
    const again = await run(organiser, 'lock_proposal', { proposal_id: proposalId });
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ trip_status: 'confirmed', in: 1 });
    expect(await confirmedEvents()).toBe(1);
  });
});
