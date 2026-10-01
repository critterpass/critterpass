/**
 * `inbox.fanout` against a migrated Postgres: each Home kind reaches the right people once per
 * event (a replayed job files nothing twice), carries its actions, expiry and undo window, and an
 * event that answers an item (an undo from any surface) settles it; badge counts follow.
 */
import { randomUUID } from 'node:crypto';

import { appendDomainEvent, withSystem } from '@cp/db';
import type { DomainEventInput } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { fanOutEvent, registerHomeInboxFanouts } from '../../src/jobs/inbox';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let fx: GuidePlanFixture;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function emit(event: DomainEventInput): Promise<string> {
  return withSystem(harness.pool, async (tx) => (await appendDomainEvent(tx, event)).id);
}

async function items(uid: string, kind: string) {
  return q<{
    id: string;
    needs_you: boolean;
    resolved_at: Date | null;
    actions: unknown;
    data: Record<string, unknown>;
    undo_until: Date | null;
    expires_at: Date | null;
    resolve_key: string | null;
    actor_id: string | null;
  }>('SELECT * FROM inbox_items WHERE user_id = $1 AND kind = $2 ORDER BY created_at', [uid, kind]);
}

async function lastBadge(uid: string) {
  const rows = await q<{ payload: { data: unknown } }>(
    `SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'badge.counts'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [`user:#${uid}`],
  );
  return rows[0]?.payload.data;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  registerHomeInboxFanouts();
  fx = await buildGuidePlan(harness.pool);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('crew.member_joined', () => {
  it('tells every other active member once, never the newcomer', async () => {
    const eventId = await emit({
      type: 'crew.member_joined',
      aggregateKind: 'crew',
      aggregateId: fx.crewId,
      actorKind: 'user',
      actorId: fx.mayaId,
      payload: { crew_id: fx.crewId, user_id: fx.mayaId },
      crewId: fx.crewId,
    });
    expect(await fanOutEvent(harness.pool, eventId)).toEqual({ resolved: 0, filed: 2 });
    expect(await fanOutEvent(harness.pool, eventId)).toEqual({ resolved: 0, filed: 0 });
    expect(await items(fx.mayaId, 'crew.member_joined')).toEqual([]);
    const [row] = await items(fx.rinId, 'crew.member_joined');
    expect(row).toMatchObject({ needs_you: false, actor_id: fx.mayaId });
    expect(await items(fx.outsiderId, 'crew.member_joined')).toEqual([]);
    expect(await lastBadge(fx.rinId)).toEqual({ needs_you: 0, unread: 1 });
  });
});

describe('nudge.received', () => {
  it('files a needs-you card for the target that expires and settles on its key', async () => {
    const [nudge] = await q<{ id: string }>(
      `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, context, channel)
       VALUES ($1, $2, $3, $4, 'vote', '{"kind":"poll","id":"0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11"}', 'push')
       RETURNING id`,
      [fx.organiserId, fx.rinId, fx.crewId, fx.tripId],
    );
    const eventId = await emit({
      type: 'nudge.received',
      aggregateKind: 'nudge',
      aggregateId: nudge!.id,
      actorKind: 'system',
      actorId: null,
      payload: {
        nudge_id: nudge!.id,
        sender_id: fx.organiserId,
        target_id: fx.rinId,
        crew_id: fx.crewId,
        reason: 'vote',
      },
      crewId: fx.crewId,
    });
    await fanOutEvent(harness.pool, eventId);
    const [card] = await items(fx.rinId, 'nudge.received');
    expect(card).toMatchObject({
      needs_you: true,
      actor_id: fx.organiserId,
      resolve_key: `nudge:${fx.rinId}:poll:0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11`,
      actions: [{ id: 'open', style: 'primary' }],
    });
    expect(card?.expires_at).not.toBeNull();
    expect(await lastBadge(fx.rinId)).toMatchObject({ needs_you: 1 });
  });
});

describe('guide_action.executed', () => {
  async function appliedAction(undoUntil: Date): Promise<{ actionId: string; eventId: string }> {
    const [changeSet] = await q<{ id: string }>(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops)
       VALUES ($1, $2, 'delay', 'guide', $3, 'draft', '[]') RETURNING id`,
      [fx.tripId, fx.versionId, fx.guideId],
    );
    const [action] = await q<{ id: string }>(
      `INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, audit)
       VALUES ($1, $2, 'reschedule_pickup', 'planned', true, '{"summary":"moved Rin''s pickup to 22:40"}')
       RETURNING id`,
      [fx.tripId, changeSet!.id],
    );
    await q("UPDATE guide_actions SET status = 'running' WHERE id = $1", [action!.id]);
    await q("UPDATE guide_actions SET status = 'done', undo_until = $2 WHERE id = $1", [
      action!.id,
      undoUntil,
    ]);
    const eventId = await emit({
      type: 'change_set.applied',
      aggregateKind: 'change_set',
      aggregateId: changeSet!.id,
      actorKind: 'guide',
      actorId: fx.guideId,
      payload: {
        trip_id: fx.tripId,
        change_set_id: changeSet!.id,
        result_version_id: fx.versionId,
      },
      tripId: fx.tripId,
      crewId: fx.crewId,
    });
    return { actionId: action!.id, eventId };
  }

  it('gives every seated traveller an UNDO row that an undo from anywhere settles', async () => {
    const until = new Date(Date.now() + 60 * 60 * 1000);
    const { actionId, eventId } = await appliedAction(until);
    await fanOutEvent(harness.pool, eventId);
    const [row] = await items(fx.rinId, 'guide_action.executed');
    expect(row).toMatchObject({
      needs_you: false,
      resolve_key: `guide_action:${actionId}`,
      actions: [
        {
          id: 'undo',
          style: 'undo',
          command: 'undo_guide_action',
          payload: { action_id: actionId },
        },
      ],
    });
    expect(row?.data['summary']).toBe("moved Rin's pickup to 22:40");
    expect(row?.undo_until?.getTime()).toBe(until.getTime());
    expect(await items(fx.outsiderId, 'guide_action.executed')).toEqual([]);

    const undone = await emit({
      type: 'guide_action.undone',
      aggregateKind: 'guide_action',
      aggregateId: actionId,
      actorKind: 'user',
      actorId: fx.rinId,
      payload: {
        trip_id: fx.tripId,
        action_id: actionId,
        undo_action_id: randomUUID(),
        change_set_id: randomUUID(),
      },
      tripId: fx.tripId,
      crewId: fx.crewId,
    });
    const outcome = await fanOutEvent(harness.pool, undone);
    expect(outcome.resolved).toBeGreaterThanOrEqual(2);
    const [settled] = await items(fx.rinId, 'guide_action.executed');
    expect(settled?.resolved_at).not.toBeNull();
    const resolvedHints = await q(
      `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'inbox.item_resolved'`,
      [`user:#${fx.rinId}`],
    );
    expect(resolvedHints.length).toBeGreaterThan(0);
  });

  it('files nothing once the undo window has closed', async () => {
    const { eventId } = await appliedAction(new Date(Date.now() - 1000));
    expect(await fanOutEvent(harness.pool, eventId)).toMatchObject({ filed: 0 });
  });
});

describe('tip.price_drop', () => {
  it('reaches members who keep guide tips on', async () => {
    await q('INSERT INTO notification_prefs (user_id, guide_tips) VALUES ($1, false)', [fx.mayaId]);
    const [tip] = await q<{ id: string }>(
      `INSERT INTO home_tips (crew_id, kind, text, facts, dedupe_key, valid_until)
       VALUES ($1, 'fare_drop', 'Flights from Singapore drop to $412.', '{"value_minor":41200}',
         'fare-drop-probe', now() + interval '3 days') RETURNING id`,
      [fx.crewId],
    );
    const eventId = await emit({
      type: 'tip.created',
      aggregateKind: 'home_tip',
      aggregateId: tip!.id,
      actorKind: 'system',
      actorId: null,
      payload: { tip_id: tip!.id, crew_id: fx.crewId, kind: 'fare_drop' },
      crewId: fx.crewId,
    });
    await fanOutEvent(harness.pool, eventId);
    expect(await items(fx.rinId, 'tip.price_drop')).toHaveLength(1);
    expect(await items(fx.mayaId, 'tip.price_drop')).toEqual([]);
  });
});

describe('invite.opened', () => {
  it('tells the inviter once a day however often the invite is opened', async () => {
    const [code] = await q<{ id: string }>(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, expires_at)
       VALUES ('KQ7M3P', 'crew', $1, $1, $2, now() + interval '7 days') RETURNING id`,
      [fx.crewId, fx.organiserId],
    );
    for (let i = 0; i < 2; i += 1) {
      const eventId = await emit({
        type: 'invite.opened',
        aggregateKind: 'join_code',
        aggregateId: code!.id,
        actorKind: 'system',
        actorId: null,
        payload: { join_code_id: code!.id, channel: 'wa' },
      });
      await fanOutEvent(harness.pool, eventId);
    }
    expect(await items(fx.organiserId, 'invite.opened')).toHaveLength(1);
  });
});
