/**
 * Quiet hours on a travel morning, on the Bali crew's Batur day (leave by 03:20 for the 04:30
 * trek): the night's quiet ends 90 minutes before the leave-by, so the 05:00 briefing push goes
 * out at once and what was held earlier in the night is released at 01:50; a leave-by that only
 * appears after a push was held still releases it then; on a morning with nowhere to be the
 * briefing waits for 07:00.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { releaseHeldNotifications, routeNotification } from '../../src/jobs/notify';
import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
import { registerTripDayNotifications } from '../../src/jobs/trip-day/notify';
import { createCopyRenderer } from '../../src/push/render';
import { insertDevice, insertEvent, queuedJobs } from '../notify-fixtures';
import {
  NOW,
  recordedMapboxRouter,
  startTripDayWorld,
  TRIP_TZ,
  type TripDayWorld,
} from './trip-day-world';

let world: TripDayWorld;
let maya: string;
let leaveAt: Date;
const renderer = createCopyRenderer();
/** Bali is UTC+8. */
const bali = (day: number, time: string) => new Date(`2026-10-${day}T${time}:00+08:00`);

beforeAll(async () => {
  world = await startTripDayWorld();
  registerTripDayNotifications();
  if ((await world.boss.getQueue('push.send')) === null) {
    await world.boss.createQueue('push.send', { policy: 'standard' });
  }
  maya = world.members[0]!;
  await insertDevice(world.harness.pool, maya, { tz: TRIP_TZ });
  await recomputeLeaveBys(world.harness.pool, world.tripId, recordedMapboxRouter().router, NOW);
  const [trek] = await world.q<{ leave_at: Date }>(
    'SELECT leave_at FROM leave_bys WHERE trip_id = $1 AND plan_item_id = $2',
    [world.tripId, world.items.trek],
  );
  leaveAt = trek!.leave_at;
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

/** A built briefing with one open line, and the `briefing.built` event it announces. */
async function briefingBuilt(localDate: string, at: Date): Promise<string> {
  const [briefing] = await world.q<{ id: string }>(
    `INSERT INTO briefings (trip_id, user_id, local_date, tz, built_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [world.tripId, maya, localDate, TRIP_TZ, at],
  );
  await world.q(
    `INSERT INTO briefing_items (briefing_id, trip_id, user_id, icon, text, action, dedupe_key)
     VALUES ($1, $2, $3, 'sun', 'Breakfast is at the villa until 10.', 'open', $4)`,
    [briefing!.id, world.tripId, maya, randomUUID()],
  );
  return insertEvent(
    world.harness.pool,
    'briefing.built',
    { trip_id: world.tripId, user_id: maya, briefing_id: briefing!.id, item_count: 1 },
    { crewId: world.crewId, tripId: world.tripId, occurredAt: at },
  );
}

const route = (eventId: string, at: Date) =>
  routeNotification(
    world.harness.pool,
    { renderer, now: () => at },
    { event_id: eventId, key: 'morning_briefing', uid: maya },
  );

async function notification(id: string) {
  const [row] = await world.q<{ state: string; not_before: Date | null }>(
    'SELECT state, not_before FROM notifications WHERE id = $1',
    [id],
  );
  return row;
}

const pushes = async (id: string) =>
  (await queuedJobs(world.harness.pool, 'push.send')).filter(
    (job) => job.data['notification_id'] === id,
  );

describe('quiet hours on a travel morning', () => {
  it('leaves by 03:20 on Batur day', () => {
    expect(leaveAt).toEqual(bali(15, '03:20'));
  });

  it('holds a push from earlier that night only until 90 minutes before the leave-by', async () => {
    const held = await route(
      await briefingBuilt('2026-10-14', bali(15, '00:30')),
      bali(15, '00:30'),
    );
    if (held.outcome !== 'routed') throw new Error('not routed');
    expect(held.decision).toEqual({ action: 'hold' });
    expect(await notification(held.notificationId)).toEqual({
      state: 'queued',
      not_before: bali(15, '01:50'),
    });

    await releaseHeldNotifications(world.harness.pool, bali(15, '01:45'));
    expect(await pushes(held.notificationId)).toEqual([]);
    await releaseHeldNotifications(world.harness.pool, bali(15, '01:50'));
    expect(await pushes(held.notificationId)).toHaveLength(1);
  });

  it('sends the 05:00 briefing at once: quiet hours ended at 01:50', async () => {
    const sent = await route(
      await briefingBuilt('2026-10-15', bali(15, '05:00')),
      bali(15, '05:00'),
    );
    if (sent.outcome !== 'routed') throw new Error('not routed');
    expect(sent.decision).toEqual({ action: 'send' });
    expect(await pushes(sent.notificationId)).toHaveLength(1);
  });

  it('keeps the briefing until 07:00 on a morning with nowhere to be', async () => {
    const held = await route(
      await briefingBuilt('2026-10-16', bali(16, '05:00')),
      bali(16, '05:00'),
    );
    if (held.outcome !== 'routed') throw new Error('not routed');
    expect(held.decision).toEqual({ action: 'hold' });
    expect(await notification(held.notificationId)).toEqual({
      state: 'queued',
      not_before: bali(16, '07:00'),
    });

    await releaseHeldNotifications(world.harness.pool, bali(16, '06:55'));
    expect(await pushes(held.notificationId)).toEqual([]);
    await releaseHeldNotifications(world.harness.pool, bali(16, '07:00'));
    expect(await pushes(held.notificationId)).toHaveLength(1);
    expect(await notification(held.notificationId)).toEqual({ state: 'queued', not_before: null });
  });

  it('releases early when the leave-by only appears after the push was held', async () => {
    const held = await route(
      await briefingBuilt('2026-10-17', bali(17, '23:30')),
      bali(17, '23:30'),
    );
    if (held.outcome !== 'routed') throw new Error('not routed');
    expect(await notification(held.notificationId)).toMatchObject({
      not_before: bali(18, '07:00'),
    });

    // The crew adds a 04:55 start for the 18th: the same leave-by, moved to that morning.
    await world.q(
      `UPDATE leave_bys SET leave_at = $2, starts_at = $2::timestamptz + interval '70 minutes'
        WHERE trip_id = $1 AND plan_item_id = $3`,
      [world.tripId, bali(18, '04:55'), world.items.trek],
    );
    await releaseHeldNotifications(world.harness.pool, bali(18, '03:20'));
    expect(await pushes(held.notificationId)).toEqual([]);
    await releaseHeldNotifications(world.harness.pool, bali(18, '03:25'));
    expect(await pushes(held.notificationId)).toHaveLength(1);
  });

  it('ignores a cancelled leave-by', async () => {
    await world.q("UPDATE leave_bys SET state = 'cancelled' WHERE trip_id = $1", [world.tripId]);
    const held = await route(
      await briefingBuilt('2026-10-18', bali(18, '04:00')),
      bali(18, '04:00'),
    );
    if (held.outcome !== 'routed') throw new Error('not routed');
    expect(held.decision).toEqual({ action: 'hold' });
    expect(await notification(held.notificationId)).toMatchObject({
      not_before: bali(18, '07:00'),
    });
  });
});
