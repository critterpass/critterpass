/**
 * `scheduled_events`: RLS class S (docs/data-model.md §3.11). app_user has no grant on the table at
 * all; a command arms, re-arms and cancels timers only through `app.schedule_event` /
 * `app.cancel_scheduled_event` (packages/db/src/jobs/schedule-event.ts). app_system reads and fires.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cancelScheduledEvent, scheduleEvent } from '../../src/jobs';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface TimerRow {
  readonly id: string;
  readonly due_at: Date;
  readonly local_at: string;
  readonly status: string;
  readonly created_by: string | null;
}

function readTimer(refId: string): Promise<TimerRow | undefined> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<TimerRow>(
      `SELECT id, due_at, local_at::text AS local_at, status, created_by::text AS created_by
       FROM scheduled_events WHERE ref_id = $1`,
      [refId],
    );
    return rows[0];
  });
}

describe('scheduled_events: system-only timer table', () => {
  it('denies app_user direct SELECT, INSERT and UPDATE', async () => {
    const actor = anonymousActor();
    for (const sql of [
      'SELECT 1 FROM scheduled_events LIMIT 1',
      `INSERT INTO scheduled_events (kind, ref_id, local_at, tz, due_at)
       VALUES ('poll.close', gen_random_uuid(), now(), 'UTC', now())`,
      "UPDATE scheduled_events SET status = 'cancelled'",
    ]) {
      await expect(
        withUser(db.pool, actor.uid, actor.device, (tx) => tx.query(sql)),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('lets a command arm, re-arm and cancel a timer through the functions', async () => {
    const actor = anonymousActor();
    const refId = randomUUID();
    const id = await withUser(db.pool, actor.uid, actor.device, (tx) =>
      scheduleEvent(tx, {
        kind: 'poll.close',
        refId,
        local: { date: '2026-10-25', time: '02:30' },
        tz: 'Europe/Berlin',
      }),
    );
    const armed = await readTimer(refId);
    expect(armed).toMatchObject({
      id,
      status: 'pending',
      local_at: '2026-10-25 02:30:00',
      created_by: actor.uid,
    });
    expect(armed?.due_at).toEqual(new Date('2026-10-25T00:30:00Z'));

    const rearmed = await withUser(db.pool, actor.uid, actor.device, (tx) =>
      scheduleEvent(tx, {
        kind: 'poll.close',
        refId,
        at: new Date('2026-11-01T12:00:00Z'),
        tz: 'Asia/Ho_Chi_Minh',
      }),
    );
    expect(rearmed).toBe(id);
    expect(await readTimer(refId)).toMatchObject({
      local_at: '2026-11-01 19:00:00',
      status: 'pending',
    });

    const key = { kind: 'poll.close', refId };
    expect(
      await withUser(db.pool, actor.uid, actor.device, (tx) => cancelScheduledEvent(tx, key)),
    ).toBe(true);
    expect(
      await withUser(db.pool, actor.uid, actor.device, (tx) => cancelScheduledEvent(tx, key)),
    ).toBe(false);
    expect((await readTimer(refId))?.status).toBe('cancelled');
  });

  it('rejects an unknown time zone and a kind that is not a queue name', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        scheduleEvent(tx, {
          kind: 'poll.close',
          refId: randomUUID(),
          at: new Date(),
          tz: 'Mars/Base',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withSystem(db.pool, (tx) =>
        scheduleEvent(tx, { kind: 'no queue', refId: randomUUID(), at: new Date(), tz: 'UTC' }),
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });
});
