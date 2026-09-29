/**
 * `calendar_days` (C3, RLS X): date-level days are their owner's alone. Nobody else — crewmates,
 * the organiser, guide_reader, powersync_repl — reads a single one; the crew only ever sees the
 * per-date counts `app.recompute_availability` derives.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('calendar_days', () => {
  it('is readable by its owner only, and by no role, publication or stream besides', async () => {
    await expectSealed(harness, 'calendar_days', { owner: 'organiser' });
  });

  it('lets a member write and change only their own days, never delete them', async () => {
    const { member, organiser } = harness.fixture.actors;
    await expect(
      as(
        member,
        `INSERT INTO calendar_days (user_id, date, state, source)
         VALUES ($1, current_date + 40, 'free', 'manual')`,
        [organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
    await as(
      member,
      `INSERT INTO calendar_days (user_id, date, state, source, guide_may_ask)
       VALUES ($1, current_date + 40, 'maybe', 'device_cal', true)`,
      [member],
    );
    const theirs = await as(member, "UPDATE calendar_days SET state = 'free' WHERE user_id = $1", [
      organiser,
    ]);
    expect(theirs.rowCount).toBe(0);
    await expect(
      as(member, 'DELETE FROM calendar_days WHERE user_id = $1', [member]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('only lets the guide ask about a maybe day', async () => {
    const { member } = harness.fixture.actors;
    await expect(
      as(
        member,
        `INSERT INTO calendar_days (user_id, date, state, source, guide_may_ask)
         VALUES ($1, current_date + 41, 'busy', 'manual', true)`,
        [member],
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
