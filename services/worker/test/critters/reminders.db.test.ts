/**
 * Legendary reminders against a migrated Postgres: a reminder fires (N-30's event) only while its
 * window still opens on the stored date and the legendary is unfound; a moved window re-arms the
 * pending reminder a month before the new start; a found legendary cancels it silently.
 */
import { scheduleEvent, withSystem } from '@cp/db';
import { REMINDER_TIMER_KIND } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rescheduleLegendaryReminders } from '../../src/jobs/critters/season-reschedule';
import { fireReminder } from '../../src/jobs/reminders/conditional';
import { startCritterWorld, type CritterWorld } from './critters-world';

let world: CritterWorld;
const NOW = new Date('2026-05-02T02:00:00Z');
const TZ = 'Asia/Ho_Chi_Minh';

beforeAll(async () => {
  world = await startCritterWorld(2);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

async function remind(uid: string, windowStart: string): Promise<string> {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO reminders (user_id, target_kind, target_id, fire_at, condition)
     VALUES ($1, 'legendary', $2, $3, $4) RETURNING id`,
    [
      uid,
      world.ids['window'],
      NOW,
      {
        kind: 'window_active_not_found',
        window_id: world.ids['window'],
        form_id: world.ids['form_legendary'],
        window_start: windowStart,
        lead_days: 30,
        tz: TZ,
      },
    ],
  );
  await withSystem(world.harness.pool, (tx) =>
    scheduleEvent(tx, {
      kind: REMINDER_TIMER_KIND,
      refId: row?.id as string,
      tz: TZ,
      local: { date: '2026-05-02', time: '09:00' },
    }),
  );
  return row?.id as string;
}

const status = async (id: string) =>
  (await world.q<{ status: string }>('SELECT status FROM reminders WHERE id = $1', [id]))[0]
    ?.status;

describe('reminders.conditional', () => {
  it('fires while the window still opens on its date and the legendary is unfound', async () => {
    const [maya] = world.members as [string];
    const id = await remind(maya, '2026-06-01');
    expect(await fireReminder(world.harness.pool, id, NOW)).toBe('fired');
    expect(await status(id)).toBe('fired');
    const due = await world.harness.pool.query(
      "SELECT payload FROM domain_events WHERE type = 'legendary.reminder_due' AND aggregate_id = $1",
      [id],
    );
    expect(due.rows).toEqual([
      { payload: { user_id: maya, window_id: world.ids['window'], reminder_id: id } },
    ]);
    expect(await fireReminder(world.harness.pool, id, NOW)).toBe('gone');
  });

  it('cancels silently once the legendary is found', async () => {
    const [, rin] = world.members as [string, string];
    const id = await remind(rin, '2026-06-01');
    await world.q(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source, verification)
       VALUES ($1, $2, $3, now(), 'grant', 'verified')`,
      [rin, world.ids['form_legendary'], world.ids['critter_804']],
    );
    expect(await fireReminder(world.harness.pool, id, NOW)).toBe('cancelled');
  });
});

describe('reminders.reschedule', () => {
  it('moves a pending reminder when its window moves, and leaves unchanged ones alone', async () => {
    const [maya] = world.members as [string];
    const id = await remind(maya, '2026-06-01');
    expect(await rescheduleLegendaryReminders(world.harness.pool, NOW)).toEqual({
      moved: 0,
      cancelled: 0,
    });
    await world.q(
      `UPDATE legendary_windows SET rule = '{"type":"annual_range","start":"07-10","end":"07-12"}'
        WHERE id = $1`,
      [world.ids['window']],
    );
    expect(await rescheduleLegendaryReminders(world.harness.pool, NOW)).toEqual({
      moved: 1,
      cancelled: 0,
    });
    const [row] = await world.q<{ start: string; local: string }>(
      `SELECT r.condition->>'window_start' AS start, to_char(e.local_at, 'YYYY-MM-DD HH24:MI') AS local
         FROM reminders r JOIN scheduled_events e ON e.ref_id = r.id WHERE r.id = $1`,
      [id],
    );
    expect(row).toEqual({ start: '2026-07-10', local: '2026-06-10 09:00' });
  });
});
