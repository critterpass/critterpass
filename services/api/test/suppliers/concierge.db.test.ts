/**
 * Human hand-offs and entry reminders on the real stack. A clinic request makes exactly one desk
 * task however it is replayed, with the traveller's words as its note and the insurance question
 * answered without sharing anything. An entry reminder arms one reminder per participant before
 * entries close and one at results, with the official link on the must-do; repeating it adds
 * nothing, a participant already reminded is not reminded again, and nobody is ever entered.
 */
import {
  DEFAULT_DESK_HOURS,
  generateUuidV7,
  isDeskOpen,
  type RequestConciergeResult,
  type SetEntryReminderResult,
} from '@cp/domain';
import { createSupplierHttp } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let outsider: SignedIn;

beforeAll(async () => {
  harness = await startMoneyHarness((registry) =>
    registerSupplierCommands(registry, {
      http: createSupplierHttp({ audit: () => Promise.resolve() }),
      links: {},
      port: undefined,
    }),
  );
  crew = await buildMoneyCrew(harness, 3);
  outsider = await harness.signIn();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

describe('request_concierge', () => {
  it('makes one desk task for a clinic call, however it is replayed', async () => {
    const [maya] = members();
    const payload = {
      task_id: generateUuidV7(),
      trip_id: crew.tripId,
      kind: 'clinic',
      text: 'Dev twisted his ankle at the waterfall, can someone call a clinic in Ubud?',
    };
    const before = Date.now();
    const first = resultOf<RequestConciergeResult>(
      await harness.run(maya, 'request_concierge', payload),
    );
    const again = resultOf<RequestConciergeResult>(
      await harness.run(maya, 'request_concierge', payload),
    );
    expect(first).toMatchObject({
      task_id: payload.task_id,
      kind: 'clinic',
      desk_open: isDeskOpen(new Date(), DEFAULT_DESK_HOURS),
      insurance: { on_file: false, consented: false },
    });
    expect(again).toMatchObject({ task_id: payload.task_id, kind: 'clinic' });
    const due = Date.parse(first.due_at);
    expect(due).toBeGreaterThan(before);
    expect(due).toBeLessThanOrEqual(before + 24 * 3_600_000 + 11 * 60_000);
    const { rows } = await harness.pool.query<{
      kind: string;
      requested_by: string;
      notes: { text: string }[];
    }>('SELECT kind, requested_by, notes FROM ops.concierge_tasks WHERE trip_id = $1', [
      crew.tripId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'clinic_handoff', requested_by: maya.uid });
    expect(rows[0]?.notes.map((note) => note.text)).toEqual([payload.text]);
  });

  it('refuses someone outside the trip', async () => {
    const response = await harness.run(outsider, 'request_concierge', {
      task_id: generateUuidV7(),
      trip_id: crew.tripId,
      kind: 'other',
      text: 'hello',
    });
    expect(response.status).toBe(404);
  });
});

describe('set_entry_reminder', () => {
  let owner = 0;
  async function mustDo(): Promise<string> {
    owner += 1;
    const { rows } = await harness.pool.query<{ id: string }>(
      "INSERT INTO must_dos (trip_id, owner_id, title, freeform) VALUES ($1, $2, 'Ghibli Museum', true) RETURNING id",
      [crew.tripId, members()[owner % 3]!.uid],
    );
    return rows[0]!.id;
  }

  async function reminders(id: string) {
    const { rows } = await harness.pool.query<{ slot: string; n: number }>(
      `SELECT condition->>'slot' AS slot, count(*)::int AS n FROM reminders
        WHERE target_kind = 'must_do' AND target_id = $1 GROUP BY 1 ORDER BY 1`,
      [id],
    );
    return rows;
  }

  it('reminds every participant before entries close and at results, once each', async () => {
    const id = await mustDo();
    const closes = new Date(Date.now() + 10 * 24 * 3_600_000);
    const payload = {
      trip_id: crew.tripId,
      must_do_id: id,
      closes_at: closes.toISOString(),
      results_at: new Date(closes.getTime() + 5 * 24 * 3_600_000).toISOString(),
      url: 'https://l-tike.com/ghibli-museum/',
    };
    const result = resultOf<SetEntryReminderResult>(
      await harness.run(members()[1], 'set_entry_reminder', payload),
    );
    expect(result).toMatchObject({
      participants: 3,
      remind_at: new Date(closes.getTime() - 24 * 3_600_000).toISOString(),
    });
    expect(await reminders(id)).toEqual([
      { slot: 'deadline', n: 3 },
      { slot: 'result', n: 3 },
    ]);
    const timers = await harness.pool.query(
      "SELECT count(*)::int AS n FROM scheduled_events WHERE kind = 'setup.lottery_remind' AND ref_id = $1",
      [id],
    );
    expect(timers.rows[0]).toEqual({ n: 6 });
    const must = await harness.pool.query(
      'SELECT external_action, external_url FROM must_dos WHERE id = $1',
      [id],
    );
    expect(must.rows[0]).toEqual({ external_action: 'lottery', external_url: payload.url });

    await harness.pool.query(
      "UPDATE reminders SET status = 'fired', fired_at = now() WHERE target_id = $1 AND user_id = $2",
      [id, members()[0].uid],
    );
    await harness.run(members()[2], 'set_entry_reminder', payload);
    expect(await reminders(id)).toEqual([
      { slot: 'deadline', n: 3 },
      { slot: 'result', n: 3 },
    ]);
  });

  it('refuses entries that already closed', async () => {
    const response = await harness.run(members()[0], 'set_entry_reminder', {
      trip_id: crew.tripId,
      must_do_id: await mustDo(),
      closes_at: new Date(Date.now() - 60_000).toISOString(),
      url: 'https://l-tike.com/ghibli-museum/',
    });
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'entries_closed' },
    });
  });
});
