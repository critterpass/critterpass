/**
 * Taking back a plan edit over the real local-first stack, with the server stood in at the
 * network boundary by its documented answers: the undo names the edit it takes back (the id the
 * edit was sent under, or the id it was sent again under after a rebase), waits for an edit that
 * is still on its way up, answers once the restored plan has reached this phone, and says so when
 * the plan has moved on or there is no signal.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import type { ApplyPlanOpsPayload } from '@cp/domain';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { SyncTransport } from '@/data/powersync/transport';

import { dayItems, instantOnDay } from '../plan-model';
import { moveOp } from '../plan-ops';
import { usePlanEditor, type EditOutcome, type UndoOutcome } from '../use-plan-editor';
import { useTripPlan } from '../use-trip-plan';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const V2 = '0192f000-0000-7000-8000-000000000102';
const WALK = '0192f000-0000-7000-8000-0000000000e1';
const TZ = 'Asia/Makassar';
const DATE = '2026-10-14';
const REASONS = { moved: 'New time', added: 'Added', removed: 'Removed' };

configure({ asyncUtilTimeout: 5000 });

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const applied: Answer = { status: 200, body: { result: { version_id: V2 } } };
const refused = (code: string, reason: string, status: number): Answer => ({
  status,
  body: { error: { code, message: code, retryable: false, detail: { reason } } },
});

let stack: TestLocalFirst | null = null;

/** The server as the undo sees it: each call takes the next answer; none left = no signal. */
function server(answers: Answer[]) {
  const calls: { path: string; payload: { trip_id: string; op_id: string } }[] = [];
  const transport: SyncTransport = {
    postJson: (path, body) => {
      const answer = answers.shift();
      if (answer === undefined) return Promise.reject(new Error('offline'));
      calls.push({
        path,
        payload: (body as { payload: (typeof calls)[number]['payload'] }).payload,
      });
      return Promise.resolve(answer);
    },
  };
  return { transport, calls };
}

async function seedVersion(s: TestLocalFirst, version: string): Promise<void> {
  await s.db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, 3, ?, ?)',
    [`day-${version}`, version, TRIP, DATE, 'Slow Ubud'],
  );
  await s.db.execute(
    `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       status, notes, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Ridge walk', 'nature')`,
    [
      `${version}-walk`,
      version,
      `day-${version}`,
      TRIP,
      WALK,
      instantOnDay(DATE, 14 * 60, TZ),
      instantOnDay(DATE, 15 * 60, TZ),
      TZ,
    ],
  );
}

async function seed(transport: SyncTransport): Promise<TestLocalFirst> {
  const s = await openTestLocalFirst({ holdUploads: true, transport });
  stack = s;
  const { db, uid } = s;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute(
    `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
     VALUES ('cm-0', ?, ?, 'active', '2026-09-01T00:00:00Z')`,
    [CREW, uid],
  );
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, tz, current_version_id) VALUES (?, ?, 'planned', ?, ?)`,
    [TRIP, CREW, TZ, V1],
  );
  await db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role) VALUES ('tp-me', ?, ?, 'organiser')`,
    [TRIP, uid],
  );
  await seedVersion(s, V1);
  return s;
}

function useEditing() {
  const plan = useTripPlan(TRIP);
  const editor = usePlanEditor(plan, REASONS, { onConflict: jest.fn(), onLocked: jest.fn() });
  return { plan, editor };
}

async function editWalk(s: TestLocalFirst) {
  const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
  await waitFor(() => {
    expect(result.current.plan.loaded).toBe(true);
    expect(result.current.plan.state.items).toHaveLength(1);
  });
  const walk = dayItems(result.current.plan.state, 3, result.current.plan.display, TZ)[0]!;
  const sent: { outcome: EditOutcome } = { outcome: { kind: 'unavailable' } };
  await act(async () => {
    sent.outcome = await result.current.editor.submit([
      moveOp(walk, { dayNo: 3, date: DATE }, 17 * 60)!,
    ]);
  });
  if (sent.outcome.kind !== 'applied') throw new Error('the edit was not sent');
  return { result, opId: sent.outcome.opId };
}

async function undo(result: { current: ReturnType<typeof useEditing> }, opId: string) {
  const got: { outcome: UndoOutcome | null } = { outcome: null };
  await act(async () => {
    got.outcome = await result.current.editor.undo(opId);
  });
  return got.outcome;
}

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('undoing a plan edit', () => {
  it('names the edit it takes back, waiting for one still on its way up', async () => {
    const { transport, calls } = server([refused('NOT_FOUND', 'edit', 404), applied]);
    const s = await seed(transport);
    const { result, opId } = await editWalk(s);
    // The answer is given once the restored plan is the one on this phone: it lands a moment on.
    const landed = { at: 0 };
    setTimeout(() => {
      landed.at = Date.now();
      void s.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [V2, TRIP]);
    }, 600);
    expect(await undo(result, opId)).toBe('undone');
    expect(landed.at).toBeGreaterThan(0);
    expect(Date.now()).toBeGreaterThanOrEqual(landed.at);
    expect(calls.map((call) => call.path)).toEqual([
      '/v1/cmd/undo_plan_edit',
      '/v1/cmd/undo_plan_edit',
    ]);
    expect(calls[1]?.payload).toEqual({ trip_id: TRIP, op_id: opId });
  });

  it('says the plan has moved on, or that there is no signal, and changes nothing', async () => {
    const { transport, calls } = server([refused('STATE_INVALID', 'plan_moved_on', 409)]);
    const { result, opId } = await editWalk(await seed(transport));
    expect(await undo(result, opId)).toBe('moved_on');
    expect(await undo(result, opId)).toBe('unavailable');
    expect(calls).toHaveLength(1);
  });

  it('takes back the edit as it was sent again after a rebase', async () => {
    const { transport, calls } = server([applied]);
    const s = await seed(transport);
    const { result, opId } = await editWalk(s);
    // Somebody else's version lands and the server turns the edit down against the old one.
    await seedVersion(s, V2);
    await s.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [V2, TRIP]);
    await s.db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM commands WHERE id = ?', [opId]);
      await tx.execute(
        `INSERT INTO rejected_commands (id, cmd, code, detail, summary, rejected_at)
         VALUES (?, 'apply_plan_ops', 'PLAN_VERSION_CONFLICT', ?, NULL, '2026-10-14T01:00:00Z')`,
        [opId, JSON.stringify({ latest: V2 })],
      );
    });
    let resent = '';
    await waitFor(async () => {
      const rows = await s.db.getAll<{ id: string; envelope: string }>(
        "SELECT id, envelope FROM commands WHERE cmd = 'apply_plan_ops'",
      );
      const payload = (JSON.parse(rows[0]?.envelope ?? '{}') as { payload?: ApplyPlanOpsPayload })
        .payload;
      expect(payload?.base_version).toBe(V2);
      resent = rows[0]?.id ?? '';
    });
    expect(resent).not.toBe(opId);
    expect(await undo(result, opId)).toBe('undone');
    expect(calls[0]?.payload.op_id).toBe(resent);
  });
});
