/**
 * The flight disruption's commands against a migrated Postgres through `/v1/cmd`: only a member a
 * row affects may answer it, and their answer is a ballot that closes the decision poll by the crew
 * decider and hands the outcome to the worker; TELL THE CREW posts the guide's line once; UNDO
 * EVERYTHING is an approver's, withdraws what still waits (poll cancelled, draft superseded) and
 * closes the disruption. The rows are seeded as the disruption job leaves them.
 */
import { randomUUID } from 'node:crypto';

import { onEventAppended, withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import pino from 'pino';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDisruptionCommands } from '../../src/commands/disruptions';
import { disruptionReactHook } from '../../src/commands/disruptions/hooks';
import { registerPollCommands } from '../../src/commands/polls';
import { startJobProducer } from '../../src/jobs/producer';
import {
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';
import { seedFlightDisruption, type SeededDisruption } from './disruption-fixture';

let harness: ActionDoorsHarness;
let boss: PgBoss;
let maya: SignedIn;
let rin: SignedIn;
let dev: SignedIn;
let outsider: SignedIn;
let seeded: SeededDisruption;

async function run(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        op_id: generateUuidV7(),
        actor: { uid: who.uid, via: 'app' },
        device: { id: randomUUID(), platform: 'ios', app_version: '1.0.0', tz: 'Asia/Makassar' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const codeOf = (body: Record<string, unknown>) =>
  (body['error'] as { code?: string } | undefined)?.code;

async function one<T>(sql: string, params: unknown[]): Promise<T | undefined> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows[0] as T);
}

beforeAll(async () => {
  harness = await startActionDoors();
  registerPollCommands(harness.registry);
  registerDisruptionCommands(harness.registry);
  onEventAppended(disruptionReactHook);
  boss = await startJobProducer({
    connectionString: harness.connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  [maya, rin, dev, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  seeded = await seedFlightDisruption(harness.pool, {
    organiser: maya.uid,
    traveller: rin.uid,
    other: dev.uid,
  });
}, 240_000);

afterAll(async () => {
  await boss.stop({ graceful: false });
  await harness.stop();
});

describe('decide_disruption_action', () => {
  it('refuses a member the row does not affect, and an outsider', async () => {
    const payload = { disruption_id: seeded.id, action_id: seeded.pickupRow, decision: 'approve' };
    const notAffected = await run(dev, 'decide_disruption_action', payload);
    expect(codeOf(notAffected.body)).toBe('NOT_ELIGIBLE');
    const stranger = await run(outsider, 'decide_disruption_action', payload);
    expect(codeOf(stranger.body)).toBe('NOT_FOUND');
  });

  it("closes the row's poll on an affected member's yes and hands it to the worker", async () => {
    const answer = await run(rin, 'decide_disruption_action', {
      disruption_id: seeded.id,
      action_id: seeded.pickupRow,
      decision: 'approve',
    });
    expect(answer.status).toBe(200);
    const poll = await one<{ status: string; winner_option_id: string; close_reason: string }>(
      'SELECT status, winner_option_id, close_reason FROM polls WHERE id = $1',
      [seeded.pickupPoll.id],
    );
    expect(poll).toMatchObject({
      status: 'closed',
      winner_option_id: seeded.pickupPoll.approve_option_id,
      close_reason: 'decider',
    });
    const job = await one<{ data: { event_type: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'disruption.react' ORDER BY created_on DESC LIMIT 1",
      [],
    );
    expect(job?.data.event_type).toBe('poll.closed');
  });
});

describe('announce_disruption', () => {
  it('posts the guide line to crew chat once, for an organiser or a traveller', async () => {
    const refused = await run(dev, 'announce_disruption', { disruption_id: seeded.id });
    expect(codeOf(refused.body)).toBe('FORBIDDEN');
    const first = await run(rin, 'announce_disruption', { disruption_id: seeded.id });
    expect(first.body['result']).toMatchObject({ posted: true });
    const again = await run(maya, 'announce_disruption', { disruption_id: seeded.id });
    expect(again.body['result']).toMatchObject({ posted: false });
    const message = await one<{ body: string; sender_kind: string }>(
      "SELECT body, sender_kind FROM messages WHERE ref_kind = 'disruption' AND ref_id = $1",
      [seeded.id],
    );
    expect(message).toEqual({ body: 'Rin lands at 19:00.', sender_kind: 'guide' });
  });
});

describe('undo_disruption_action', () => {
  it("is an approver's, withdraws what still waits and closes the disruption", async () => {
    const refused = await run(dev, 'undo_disruption_action', {
      disruption_id: seeded.id,
      action_id: 'all',
    });
    expect(codeOf(refused.body)).toBe('FORBIDDEN');
    const undone = await run(maya, 'undo_disruption_action', {
      disruption_id: seeded.id,
      action_id: 'all',
    });
    expect(undone.status).toBe(200);
    const row = await one<{ status: string; actions: { id: string; state: string }[] }>(
      'SELECT status, actions FROM disruptions WHERE id = $1',
      [seeded.id],
    );
    expect(row?.status).toBe('undone');
    expect(row?.actions.find((a) => a.id === seeded.dinnerRow)?.state).toBe('withdrawn');
    const poll = await one<{ status: string }>('SELECT status FROM polls WHERE id = $1', [
      seeded.dinnerPoll,
    ]);
    expect(poll?.status).toBe('cancelled');
    const draft = await one<{ status: string }>(
      'SELECT status FROM ops.vendor_messages WHERE id = $1',
      [seeded.draftId],
    );
    expect(draft?.status).toBe('superseded');
  });
});
