/**
 * Plan editing over the real local-first stack with synced rows seeded locally: an organiser's
 * edit queues `apply_plan_ops` and shows at once; a member's edit becomes a change set sent to the
 * crew; a version conflict on an untouched item is rebased onto the latest version and sent again
 * once; a conflict on the same item is surfaced instead; and item times read as local minutes,
 * overnight included.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import type { ApplyPlanOpsPayload, CreateChangesetPayload } from '@cp/domain';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { dayItems, instantOnDay, minutesOnDay } from '../plan-model';
import { addOp, moveOp } from '../plan-ops';
import { usePlanEditor } from '../use-plan-editor';
import { useTripPlan } from '../use-trip-plan';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const V2 = '0192f000-0000-7000-8000-000000000102';
const WALK = '0192f000-0000-7000-8000-0000000000e1';
const SPA = '0192f000-0000-7000-8000-0000000000e2';
const TZ = 'Asia/Makassar';
const DATE = '2026-10-14';
const REASONS = { moved: 'New time', added: 'Added', removed: 'Removed' };

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

async function seed(role: 'organiser' | 'member'): Promise<TestLocalFirst> {
  const s = await openTestLocalFirst({ holdUploads: true });
  stack = s;
  const { db, uid } = s;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
    uid,
    'Winston',
    MAYA,
    'Maya',
  ]);
  for (const [index, member] of [uid, MAYA].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at) VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${index}`, CREW, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, tz, current_version_id) VALUES (?, ?, 'planned', ?, ?)`,
    [TRIP, CREW, TZ, V1],
  );
  await db.execute(
    'INSERT INTO trip_participants (id, trip_id, user_id, role) VALUES (?, ?, ?, ?)',
    ['tp-me', TRIP, uid, role],
  );
  await seedVersion(s, V1, { walk: '14:00', spa: '16:00' });
  return s;
}

async function seedVersion(
  s: TestLocalFirst,
  version: string,
  times: { walk: string; spa: string },
): Promise<void> {
  const day = `day-${version}`;
  await s.db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, 3, ?, ?)',
    [day, version, TRIP, DATE, 'Slow Ubud'],
  );
  const item = (id: string, stable: string, at: string, notes: string) =>
    s.db.execute(
      `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         status, notes, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'nature')`,
      [
        id,
        version,
        day,
        TRIP,
        stable,
        instantOnDay(DATE, Number(at.slice(0, 2)) * 60, TZ),
        instantOnDay(DATE, Number(at.slice(0, 2)) * 60 + 60, TZ),
        TZ,
        notes,
      ],
    );
  await item(`${version}-walk`, WALK, times.walk, 'Ridge walk');
  await item(`${version}-spa`, SPA, times.spa, 'Karsa spa');
}

function queuedPayloads<T>(s: TestLocalFirst, cmd: string) {
  return s.db
    .getAll<{ id: string; envelope: string }>(
      'SELECT id, envelope FROM commands WHERE cmd = ? ORDER BY seq',
      [cmd],
    )
    .then((rows) =>
      rows.map((row) => ({
        opId: row.id,
        payload: (JSON.parse(row.envelope) as { payload: T }).payload,
      })),
    );
}

function useEditing(onConflict = jest.fn(), onLocked = jest.fn()) {
  const plan = useTripPlan(TRIP);
  const editor = usePlanEditor(plan, REASONS, { onConflict, onLocked });
  return { plan, editor };
}

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('plan items on the day', () => {
  it('reads times as local minutes, an early pickup the next morning past midnight', () => {
    const next = instantOnDay('2026-10-15', 3 * 60 + 30, TZ);
    expect(minutesOnDay(next, TZ, DATE)).toBe(24 * 60 + 3 * 60 + 30);
    expect(minutesOnDay(instantOnDay(DATE, 14 * 60 + 15, TZ), TZ, DATE)).toBe(14 * 60 + 15);
  });
});

describe('plan editing', () => {
  it('queues an organiser move as apply_plan_ops and shows it at once', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(2));
    const walk = dayItems(result.current.plan.state, 3, result.current.plan.display, TZ)[0]!;
    expect(walk.title).toBe('Ridge walk');
    await act(async () => {
      await result.current.editor.submit([moveOp(walk, { dayNo: 3, date: DATE }, 17 * 60)!]);
    });
    const sent = await queuedPayloads<ApplyPlanOpsPayload>(s, 'apply_plan_ops');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.base_version).toBe(V1);
    await waitFor(() => {
      const moved = dayItems(result.current.plan.state, 3, result.current.plan.display, TZ);
      expect(moved.map((item) => [item.title, item.start])).toEqual([
        ['Karsa spa', 16 * 60],
        ['Ridge walk', 17 * 60],
      ]);
      expect(result.current.plan.queued.has(WALK)).toBe(true);
    });
  });

  it('turns a member add into a change set sent to the crew', async () => {
    const s = await seed('member');
    const { result } = await renderHook(() => useEditing(), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(2));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.editor.submit([
        addOp(
          { dayNo: 3, date: DATE },
          {
            title: 'Coffee at Seniman',
            poiId: null,
            category: 'cafe',
            start: 9 * 60,
            end: 10 * 60,
            tz: TZ,
          },
        ),
      ]);
    });
    expect(outcome).toMatchObject({ kind: 'proposed' });
    expect(await queuedPayloads(s, 'apply_plan_ops')).toHaveLength(0);
    const created = await queuedPayloads<CreateChangesetPayload>(s, 'create_changeset');
    expect(created).toHaveLength(1);
    const set = created[0]!.payload;
    expect(set.base_version).toBe(V1);
    expect(set.ops).toEqual([
      expect.objectContaining({
        op: 'add',
        affected_user_ids: [s.uid, MAYA],
        after: expect.objectContaining({ day_no: 3, notes: 'Coffee at Seniman' }),
      }),
    ]);
    const sends = await queuedPayloads<{ changeset_id: string }>(s, 'send_changeset');
    expect(sends.map((send) => send.payload.changeset_id)).toEqual([set.changeset_id]);
    await waitFor(() => expect(result.current.plan.proposed.size).toBe(1));
  });

  async function rejectFirstEdit(s: TestLocalFirst, latest: string): Promise<string> {
    const [edit] = await queuedPayloads<ApplyPlanOpsPayload>(s, 'apply_plan_ops');
    await s.db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM commands WHERE id = ?', [edit!.opId]);
      await tx.execute(
        `INSERT INTO rejected_commands (id, cmd, code, detail, summary, rejected_at)
         VALUES (?, 'apply_plan_ops', 'PLAN_VERSION_CONFLICT', ?, NULL, '2026-10-14T01:00:00Z')`,
        [edit!.opId, JSON.stringify({ latest })],
      );
    });
    return edit!.opId;
  }

  it('rebases a conflicting edit onto the latest version and sends it again once', async () => {
    const s = await seed('organiser');
    const onConflict = jest.fn();
    const { result } = await renderHook(() => useEditing(onConflict), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(2));
    const walk = dayItems(result.current.plan.state, 3, result.current.plan.display, TZ)[0]!;
    await act(async () => {
      await result.current.editor.submit([moveOp(walk, { dayNo: 3, date: DATE }, 17 * 60)!]);
    });
    // Maya moved the spa meanwhile: a new version the walk edit does not touch.
    await seedVersion(s, V2, { walk: '14:00', spa: '11:00' });
    await s.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [V2, TRIP]);
    const rejectedId = await rejectFirstEdit(s, V2);
    await waitFor(async () => {
      const resent = await queuedPayloads<ApplyPlanOpsPayload>(s, 'apply_plan_ops');
      expect(resent.map((edit) => edit.payload.base_version)).toEqual([V2]);
    });
    const left = await s.db.getAll('SELECT id FROM rejected_commands WHERE id = ?', [rejectedId]);
    expect(left).toHaveLength(0);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('surfaces a conflict on the same item instead of guessing', async () => {
    const s = await seed('organiser');
    const onConflict = jest.fn();
    const { result } = await renderHook(() => useEditing(onConflict), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.plan.state.items).toHaveLength(2));
    const walk = dayItems(result.current.plan.state, 3, result.current.plan.display, TZ)[0]!;
    await act(async () => {
      await result.current.editor.submit([moveOp(walk, { dayNo: 3, date: DATE }, 17 * 60)!]);
    });
    await seedVersion(s, V2, { walk: '12:00', spa: '16:00' });
    await s.db.execute(
      `INSERT INTO activity_events (id, trip_id, actor_kind, actor_id, verb, object_kind, object_id, at)
       VALUES ('ae-1', ?, 'user', ?, 'moved', 'plan_item', ?, '2026-10-14T00:30:00Z')`,
      [TRIP, MAYA, WALK],
    );
    await s.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [V2, TRIP]);
    await rejectFirstEdit(s, V2);
    await waitFor(() => expect(onConflict).toHaveBeenCalledWith([WALK], 'Maya'));
    expect(await queuedPayloads(s, 'apply_plan_ops')).toHaveLength(0);
  });
});
