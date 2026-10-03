/**
 * The flight disruption end to end on a real pg-boss runtime: a replayed AeroAPI delay alert
 * becomes one disruption whose guide-only fix ticks done on the executor's real completion, whose
 * crew-wide change and driver message wait for a yes on decision polls, and whose driver retime
 * runs only after Made confirms. A delay that grows re-versions it; a flight back on time resolves
 * it and undoes the guide's own fix. The guide's words fall back to templates (no model here).
 */
import {
  appendDomainEvent,
  closePollInTx,
  loadPollState,
  onEventAppended,
  withSystem,
} from '@cp/db';
import type { DisruptionAction } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  executeGuideAction,
  guideActionExecuteJob,
  planGuideAction,
} from '../../src/guide-actions';
import { handleFlightEvent } from '../../src/jobs/flights/flight-event';
import { noAnswerJob } from '../../src/jobs/disruptions/apply-vendor-reply';
import { disruptionWriter } from '../../src/jobs/disruptions/copy';
import {
  flightDisruptionJob,
  runFlightDisruption,
} from '../../src/jobs/disruptions/flight-disruption';
import { disruptionEventHook } from '../../src/jobs/disruptions/hooks';
import { disruptionReactJob } from '../../src/jobs/disruptions/react';
import { leaveByRecomputeJob } from '../../src/jobs/trip-day/leaveby-recompute';
import { straightLineLeaveByRouter } from '../../src/jobs/trip-day/route-eta';
import { startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';
import { buildFlightWorld, NOW, type FlightWorld } from './flight-world';

let harness: JobsHarness;
let world: FlightWorld;

interface Disruption {
  id: string;
  status: string;
  version: number;
  actions: DisruptionAction[];
}

async function disruption(): Promise<Disruption | undefined> {
  const { rows } = await harness.pool.query<Disruption>(
    `SELECT id, status, version, actions FROM disruptions WHERE trip_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [world.tripId],
  );
  return rows[0];
}

const row = (d: Disruption | undefined, id: string) => d?.actions.find((a) => a.id === id);
const stateOf = async (id: string) => row(await disruption(), id)?.state;

async function alert(delayMin: number, code: string): Promise<void> {
  world.delay(delayMin);
  await handleFlightEvent(harness.pool, world.aero, { ...world.alert, event_code: code }, NOW);
}

async function closePoll(pollId: string, winner: string | null, actor: string): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const state = await loadPollState(tx, pollId);
    if (state === undefined) throw new Error('poll missing');
    await closePollInTx(tx, state, {
      reason: 'decider',
      now: new Date(),
      actorId: actor,
      deciderWinner: winner,
    });
  });
}

/** Waits for `check`, reporting any failed job (with its error) when it does not come true. */
async function waitFor(check: () => Promise<boolean>, ms = 45_000): Promise<void> {
  await until(check, ms).catch(async (error: unknown) => {
    const { rows } = await harness.pool.query(
      "SELECT name, state, output FROM pgboss.job WHERE state IN ('retry', 'failed')",
    );
    throw new Error(`${String(error)}: ${JSON.stringify(rows).slice(0, 2000)}`);
  });
}

beforeAll(async () => {
  harness = await startJobsHarness();
  world = await buildFlightWorld(harness.pool);
  await harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = true WHERE partner = 'whatsapp_business'",
  );
  // A person staffs the desk, so an approved draft goes to the desk to send.
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ('safety.ops_desk', 'true'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  onEventAppended(disruptionEventHook);
  await harness.startRuntime([
    flightDisruptionJob(disruptionWriter(undefined)),
    disruptionReactJob(),
    noAnswerJob(),
    guideActionExecuteJob({ now: () => NOW }),
    leaveByRecomputeJob(straightLineLeaveByRouter),
  ]);
}, 240_000);

afterAll(async () => {
  await harness.stopAll();
  await harness.close();
});

describe('flight disruption', () => {
  const surf = () => `retime_item:${world.surfStableId}`;
  const dinner = () => `retime_item:${world.dinner.stableId}`;
  const made = () => `contact_vendor:${world.pickup.stableId}`;
  const pickup = () => `reschedule_pickup:${world.pickup.stableId}`;

  it('turns a delay alert into rows: done on its own, needs a yes, a draft for the driver', async () => {
    await alert(90, 'delay-90');
    await waitFor(async () => (await stateOf(surf())) === 'done');
    const d = await disruption();
    expect(d).toMatchObject({ status: 'open', version: 1 });
    expect(row(d, surf())).toMatchObject({ autonomous: true, facts: { to: '21:00' } });
    expect(row(d, dinner())).toMatchObject({
      state: 'needs_yes',
      decider: { policy: 'any_affected' },
    });
    expect(row(d, dinner())?.poll).not.toBeNull();
    expect(row(d, made())).toMatchObject({ state: 'draft_ready', autonomous: false });
    expect(row(d, pickup())).toMatchObject({ state: 'waiting_vendor', depends_on: made() });
    const [draft] = (
      await harness.pool.query<{ status: string; proposed_by: string; body: string }>(
        'SELECT status, proposed_by, body FROM ops.vendor_messages WHERE id = $1',
        [row(d, made())?.vendor_message_id],
      )
    ).rows;
    expect(draft).toMatchObject({ status: 'draft', proposed_by: 'guide' });
    expect(draft?.body).toContain('19:30');
    const { rows: surfItem } = await harness.pool.query<{ starts_at: Date }>(
      `SELECT pi.starts_at FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
        WHERE t.id = $1 AND pi.stable_id = $2`,
      [world.tripId, world.surfStableId],
    );
    expect(surfItem[0]?.starts_at.toISOString()).toBe('2026-10-15T13:00:00.000Z');
  });

  it('never widens what runs on its own from owner ids a request carries', async () => {
    const planned = await withSystem(harness.pool, (tx) =>
      planGuideAction(tx, {
        tripId: world.tripId,
        kind: 'retime_item',
        ops: [
          {
            op: 'retime',
            target: world.dinner.stableId,
            after: { starts_at: '2026-10-15T13:00:00Z' },
            reason: 'asked in chat',
            affected_user_ids: [world.organiserId, world.rinId, world.mayaId],
            booking_impact: false,
          },
        ],
        guideId: world.guideId,
        requesterId: world.rinId,
        ownerIds: [world.organiserId, world.rinId, world.mayaId],
      } as Parameters<typeof planGuideAction>[1]),
    );
    const outcome = await withSystem(harness.pool, (tx) =>
      executeGuideAction(tx, planned.actionId, { now: () => NOW }),
    );
    expect(outcome.status).toBe('needs_approval');
    const { rows } = await harness.pool.query<{ audit: { inputs: Record<string, unknown> } }>(
      'SELECT audit FROM guide_actions WHERE id = $1',
      [planned.actionId],
    );
    expect(rows[0]?.audit.inputs).not.toHaveProperty('owner_ids');
  });

  it("applies the crew's yes on the dinner through the vote", async () => {
    const poll = row(await disruption(), dinner())?.poll;
    await closePoll(poll?.id as string, poll?.approve_option_id as string, world.mayaId);
    await waitFor(async () => (await stateOf(dinner())) === 'done');
    expect(row(await disruption(), dinner())?.decided_by).toBe(world.mayaId);
  });

  it('asks Made only after a yes, and moves the pickup only once Made confirms', async () => {
    const d = await disruption();
    const poll = row(d, made())?.poll;
    const messageId = row(d, made())?.vendor_message_id as string;
    await closePoll(poll?.id as string, poll?.approve_option_id as string, world.rinId);
    await waitFor(async () => (await stateOf(made())) === 'approved');
    expect(await stateOf(pickup())).toBe('waiting_vendor');
    const { rows: approvals } = await harness.pool.query<{ user_id: string }>(
      "SELECT user_id FROM ops.approvals WHERE subject_kind = 'vendor_message' AND subject_id = $1",
      [messageId],
    );
    expect(approvals.map((a) => a.user_id)).toEqual([world.rinId]);
  });

  it('moves the pickup only once Made confirms, after the desk sent the message', async () => {
    const d = await disruption();
    const messageId = row(d, made())?.vendor_message_id as string;
    await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ thread_id: string }>(
        `UPDATE ops.vendor_messages SET status = 'sent', sent_at = now(), version = version + 1
          WHERE id = $1 RETURNING thread_id`,
        [messageId],
      );
      await appendDomainEvent(tx, {
        type: 'vendor_msg.sent',
        aggregateKind: 'vendor_message',
        aggregateId: messageId,
        actorKind: 'system',
        actorId: null,
        crewId: world.crewId,
        tripId: world.tripId,
        payload: { trip_id: world.tripId, thread_id: rows[0]?.thread_id, message_id: messageId },
      });
    });
    await waitFor(async () => (await stateOf(made())) === 'sent');
    expect(await stateOf(pickup())).toBe('waiting_vendor');
    // The reply as the reply parser leaves it (its model call is the network boundary).
    await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string; thread_id: string }>(
        `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, proposed_by, body, status,
           reply)
         SELECT thread_id, trip_id, 'inbound', 'vendor', 'ok bisa 19:30', 'received',
                '{"intent":"yes","times":["19:30"],"prices":[],"needs_person":false}'::jsonb
           FROM ops.vendor_messages WHERE id = $1
         RETURNING id, thread_id`,
        [messageId],
      );
      await appendDomainEvent(tx, {
        type: 'vendor_msg.reply_parsed',
        aggregateKind: 'vendor_message',
        aggregateId: rows[0]?.id as string,
        actorKind: 'system',
        actorId: null,
        crewId: world.crewId,
        tripId: world.tripId,
        payload: {
          trip_id: world.tripId,
          thread_id: rows[0]?.thread_id,
          message_id: rows[0]?.id,
          intent: 'yes',
          needs_person: false,
        },
      });
    });
    await waitFor(async () => (await stateOf(pickup())) === 'done');
    expect(row(await disruption(), made())).toMatchObject({
      state: 'confirmed',
      label: 'Made confirmed 19:30',
    });
  });

  it('re-versions a delay that grows; back on time, the plan returns to its original times', async () => {
    await alert(150, 'delay-150');
    await waitFor(async () => {
      const d = await disruption();
      return d?.version === 2 && row(d, surf())?.facts['to'] === '22:00';
    });
    await waitFor(async () => (await stateOf(surf())) === 'done');
    await harness.pool.query(
      'UPDATE flight_segments SET est_arr_at = sched_arr_at, delay_min = 0 WHERE id = $1',
      [world.segmentId],
    );
    const outcome = await runFlightDisruption(
      harness.pool,
      { trip_id: world.tripId, segment_id: world.segmentId },
      disruptionWriter(undefined),
      NOW,
    );
    expect(outcome).toBe('resolved');
    const d = await disruption();
    expect(d?.status).toBe('resolved');
    expect(row(d, surf())?.state).toBe('undone');
    const { rows } = await harness.pool.query<{ starts_at: Date }>(
      `SELECT pi.starts_at FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
        WHERE t.id = $1 AND pi.stable_id = $2`,
      [world.tripId, world.surfStableId],
    );
    expect(rows[0]?.starts_at.toISOString()).toBe('2026-10-15T11:48:00.000Z');
  });
});
