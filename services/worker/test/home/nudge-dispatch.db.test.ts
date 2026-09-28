/**
 * `nudge.dispatch` against a migrated Postgres: the timer marks the nudge and its delivery sent
 * once and appends `nudge.received`; the fan-out files the target's needs-you card; the N-12 push
 * is composed from the trip's guide, says who asked, and goes to the target only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { fanOutEvent, registerHomeInboxFanouts } from '../../src/jobs/inbox';
import { dispatchNudge, registerNudgeNotifications } from '../../src/jobs/nudges';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let fx: GuidePlanFixture;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

beforeAll(async () => {
  harness = await startJobsHarness();
  registerHomeInboxFanouts();
  registerNudgeNotifications();
  fx = await buildGuidePlan(harness.pool);
  await q("UPDATE users SET display_name = 'Winston Tan' WHERE id = $1", [fx.organiserId]);
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('dispatchNudge', () => {
  it('delivers once: sent, received event, inbox card and a push from the guide', async () => {
    const [delivery] = await q<{ id: string }>(
      `INSERT INTO scheduled_deliveries (user_id, kind, target_ref, send_at_local, tz, due_at)
       VALUES ($1, 'nudge', 'n', '2026-09-29T21:00', 'Asia/Tokyo', now()) RETURNING id`,
      [fx.rinId],
    );
    const [nudge] = await q<{ id: string }>(
      `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, channel,
         scheduled_delivery_id, send_at)
       VALUES ($1, $2, $3, $4, 'rsvp', 'push', $5, now()) RETURNING id`,
      [fx.organiserId, fx.rinId, fx.crewId, fx.tripId, delivery!.id],
    );
    expect(await dispatchNudge(harness.pool, nudge!.id)).toBe('sent');
    expect(await dispatchNudge(harness.pool, nudge!.id)).toBe('already_sent');

    const [delivered] = await q<{ status: string }>(
      'SELECT status FROM scheduled_deliveries WHERE id = $1',
      [delivery!.id],
    );
    expect(delivered?.status).toBe('sent');
    const events = await q<{ id: string; type: string; payload: Record<string, unknown> }>(
      `SELECT e.id, e.type, e.payload, e.crew_id, e.trip_id, e.actor_id, e.occurred_at
         FROM app.domain_event_for_routing(
           (SELECT id FROM domain_events WHERE aggregate_id = $1 AND type = 'nudge.received')) e`,
      [nudge!.id],
    );
    expect(events).toHaveLength(1);

    await fanOutEvent(harness.pool, events[0]!.id);
    const cards = await q<{ needs_you: boolean; actor_id: string }>(
      `SELECT needs_you, actor_id FROM inbox_items WHERE user_id = $1 AND kind = 'nudge.received'`,
      [fx.rinId],
    );
    expect(cards).toEqual([{ needs_you: true, actor_id: fx.organiserId }]);

    const registration = getRegistration('nudge.received', 'nudge');
    expect(registration).toBeDefined();
    const row = events[0] as unknown as {
      id: string;
      payload: Record<string, unknown>;
      crew_id: string;
      trip_id: string;
      actor_id: string | null;
      occurred_at: Date;
    };
    const event: RoutedEvent = {
      id: row.id,
      type: 'nudge.received',
      payload: row.payload,
      crewId: row.crew_id,
      tripId: row.trip_id,
      actorId: row.actor_id,
      occurredAt: row.occurred_at,
    };
    const client = await harness.pool.connect();
    try {
      expect(await registration!.audience(client, event)).toEqual([fx.rinId]);
      const composed = await registration!.compose(client, event, fx.rinId);
      expect(composed).toMatchObject({
        title: { id: 'notifications.nudge.title' },
        body: { id: 'notifications.nudge.rsvp' },
        vars: { sender: 'Winston' },
        sender: { kind: 'guide' },
        deepLink: '/inbox',
        needsYou: true,
      });
    } finally {
      client.release();
    }
  });
});
