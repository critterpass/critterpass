/**
 * An organiser edits her own draft before the crew has a plan, over the real local-first stack:
 * the edit goes out as `apply_draft_ops` on the draft she sees and shows at once, UNDO sends the
 * edit that puts the draft back (the server is never asked to take a draft edit back), a removed
 * stop comes back whole, and a member, who has no plan to see yet, sends nothing.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import type { ApplyPlanOpsPayload, PlanState } from '@cp/domain';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { SyncTransport } from '@/data/powersync/transport';

import { inverseOps } from '../inverse-ops';
import { dayItems, instantOnDay } from '../plan-model';
import { moveOp, removeOp } from '../plan-ops';
import { usePlanEditor, type EditOutcome } from '../use-plan-editor';
import { useTripPlan } from '../use-trip-plan';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const DRAFT = '0192f000-0000-7000-8000-000000000101';
const WALK = '0192f000-0000-7000-8000-0000000000e1';
const TZ = 'Asia/Makassar';
const DATE = '2026-10-14';
const REASONS = { moved: 'New time', added: 'Added', removed: 'Removed' };

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;
const asked: string[] = [];
const transport: SyncTransport = {
  postJson: (path) => {
    asked.push(path);
    return Promise.reject(new Error('offline'));
  },
};

async function seed(role: 'organiser' | 'member'): Promise<TestLocalFirst> {
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
    `INSERT INTO trips (id, crew_id, status, tz, draft_version_id) VALUES (?, ?, 'setup', ?, ?)`,
    [TRIP, CREW, TZ, DRAFT],
  );
  await db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role) VALUES ('tp-me', ?, ?, ?)`,
    [TRIP, uid, role],
  );
  // An organiser's draft reaches her phone alone; a member has no row of it.
  if (role === 'member') return s;
  await db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date) VALUES (?, ?, ?, 3, ?)',
    ['day-3', DRAFT, TRIP, DATE],
  );
  await db.execute(
    `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       status, notes, category)
     VALUES ('walk', ?, 'day-3', ?, ?, ?, ?, ?, 'proposed', 'Ridge walk', 'nature')`,
    [DRAFT, TRIP, WALK, instantOnDay(DATE, 14 * 60, TZ), instantOnDay(DATE, 15 * 60, TZ), TZ],
  );
  return s;
}

function useEditing() {
  const plan = useTripPlan(TRIP, { version: 'draft-or-current' });
  const editor = usePlanEditor(plan, REASONS, { onConflict: jest.fn(), onLocked: jest.fn() });
  return { plan, editor };
}

async function queued(s: TestLocalFirst) {
  const rows = await s.db.getAll<{ cmd: string; envelope: string }>(
    'SELECT cmd, envelope FROM commands ORDER BY seq',
  );
  return rows.map((row) => ({
    cmd: row.cmd,
    payload: (JSON.parse(row.envelope) as { payload: ApplyPlanOpsPayload }).payload,
  }));
}

const walkOf = (current: ReturnType<typeof useEditing>) =>
  dayItems(current.plan.state, 3, current.plan.display, TZ)[0];

afterEach(async () => {
  asked.length = 0;
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('editing the organiser draft', () => {
  it('sends the edit on the draft, shows it at once, and puts it back on UNDO', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(1));
    expect(result.current.plan).toMatchObject({ mode: 'draft', versionId: DRAFT, canApply: true });

    const sent: { outcome: EditOutcome } = { outcome: { kind: 'unavailable' } };
    await act(async () => {
      sent.outcome = await result.current.editor.submit([
        moveOp(walkOf(result.current)!, { dayNo: 3, date: DATE }, 17 * 60)!,
      ]);
    });
    if (sent.outcome.kind !== 'applied') throw new Error('the edit was not sent');
    const { opId } = sent.outcome;
    await waitFor(() =>
      expect(result.current.plan.state.items[0]?.starts_at).toBe(instantOnDay(DATE, 17 * 60, TZ)),
    );
    const first = await queued(s);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      cmd: 'apply_draft_ops',
      payload: { trip_id: TRIP, base_version: DRAFT },
    });

    await act(async () => {
      expect(await result.current.editor.undo(opId)).toBe('undone');
    });
    await waitFor(() =>
      expect(result.current.plan.state.items[0]?.starts_at).toBe(instantOnDay(DATE, 14 * 60, TZ)),
    );
    expect((await queued(s)).map((row) => row.cmd)).toEqual(['apply_draft_ops', 'apply_draft_ops']);
    // The server keeps only her latest draft edit: it is never asked to take one back.
    expect(asked).toEqual([]);
  });

  it('brings a removed stop back whole', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(1));
    const sent: { outcome: EditOutcome } = { outcome: { kind: 'unavailable' } };
    await act(async () => {
      sent.outcome = await result.current.editor.submit([removeOp(walkOf(result.current)!)]);
    });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(0));
    if (sent.outcome.kind !== 'applied') throw new Error('the edit was not sent');
    const { opId } = sent.outcome;
    await act(async () => {
      await result.current.editor.undo(opId);
    });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(1));
    expect(result.current.plan.state.items[0]).toMatchObject({
      stable_id: WALK,
      day_no: 3,
      notes: 'Ridge walk',
      category: 'nature',
      starts_at: instantOnDay(DATE, 14 * 60, TZ),
    });
  });

  it('sends nothing for a member, who has no plan to see yet', async () => {
    const s = await seed('member');
    const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.loaded).toBe(true));
    expect(result.current.plan).toMatchObject({ mode: 'group', versionId: null });
    const sent: { outcome: EditOutcome | null } = { outcome: null };
    await act(async () => {
      sent.outcome = await result.current.editor.submit([{ op: 'remove', item: WALK }]);
    });
    expect(sent.outcome).toEqual({ kind: 'unavailable' });
    expect(await queued(s)).toEqual([]);
  });
});

describe('inverseOps', () => {
  it('puts a new day order back', () => {
    const before: PlanState = {
      days: [1, 2, 3].map((dayNo) => ({ day_no: dayNo, date: null, theme: `Day ${dayNo}` })),
      items: [],
    };
    expect(inverseOps([{ op: 'reorder_days', new: { order: [3, 1, 2] } }], before)).toEqual([
      { op: 'reorder_days', new: { order: [2, 3, 1] } },
    ]);
  });
});
