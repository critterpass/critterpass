/**
 * Reordering a day by hand over the real local-first stack: a lifted stop previews the order as it
 * crosses others and cancelling drops the preview; a drop times the day again (lunch keeps its slot
 * unless the stop before pushes it) and an organiser's goes out as `apply_plan_ops` while a
 * member's becomes a change set; a booked stop refuses to lift, and an order that would run into
 * it is refused with nothing sent.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';
import { useMemo } from 'react';

import type { ApplyPlanOpsPayload, CreateChangesetPayload } from '@cp/domain';

import { dayItems, instantOnDay, minutesOnDay } from '@/data/plan/plan-model';
import { usePlanEditor } from '@/data/plan/use-plan-editor';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useReorder } from '../use-reorder';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const WALK = '0192f000-0000-7000-8000-0000000000e1';
const LUNCH = '0192f000-0000-7000-8000-0000000000e2';
const SPA = '0192f000-0000-7000-8000-0000000000e3';
const BOOKING = '0192f000-0000-7000-8000-0000000000b1';
const TZ = 'Asia/Makassar';
const DATE = '2026-10-14';
const REASONS = { moved: 'New time', added: 'Added', removed: 'Removed' };
const LEG = 15;

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

async function seed(role: 'organiser' | 'member', bookedSpa = false): Promise<TestLocalFirst> {
  const s = await openTestLocalFirst({ holdUploads: true });
  stack = s;
  const { db, uid } = s;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
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
  await db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, 3, ?, ?)',
    ['day-3', V1, TRIP, DATE, 'Slow Ubud'],
  );
  const item = (
    stable: string,
    hour: number,
    minutes: number,
    notes: string,
    booking: string | null,
  ) =>
    db.execute(
      `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         status, notes, category, booking_id)
       VALUES (?, ?, 'day-3', ?, ?, ?, ?, ?, 'confirmed', ?, 'nature', ?)`,
      [
        `${stable}-row`,
        V1,
        TRIP,
        stable,
        instantOnDay(DATE, hour * 60, TZ),
        instantOnDay(DATE, hour * 60 + minutes, TZ),
        TZ,
        notes,
        booking,
      ],
    );
  await item(WALK, 9, 210, 'Ridge walk', null);
  await item(LUNCH, 13, 60, 'Lunch', null);
  await item(SPA, 16, 120, 'Karsa spa', bookedSpa ? BOOKING : null);
  return s;
}

function useDayReorder() {
  const plan = useTripPlan(TRIP);
  const editor = usePlanEditor(plan, REASONS, { onConflict: jest.fn(), onLocked: jest.fn() });
  const stops = useMemo(
    () => dayItems(plan.state, 3, plan.display, TZ),
    [plan.state, plan.display],
  );
  const reorder = useReorder({
    stops,
    slot: { dayNo: 3, date: DATE },
    travel: () => LEG,
    submit: (ops) => editor.submit(ops),
    editable: true,
  });
  return { plan, stops, reorder };
}

async function loaded(result: { current: ReturnType<typeof useDayReorder> }) {
  await waitFor(() => expect(result.current.stops).toHaveLength(3));
}

function queued<T>(s: TestLocalFirst, cmd: string): Promise<T[]> {
  return s.db
    .getAll<{ envelope: string }>('SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq', [cmd])
    .then((rows) => rows.map((row) => (JSON.parse(row.envelope) as { payload: T }).payload));
}

const local = (at: string) => minutesOnDay(at, TZ, DATE);

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('day plan reorder', () => {
  it('previews the order while a stop crosses others, and forgets it on cancel', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useDayReorder(), { wrapper: s.wrapper });
    await loaded(result);
    await act(() => {
      expect(result.current.reorder.lift(0)).toEqual({ ok: true });
    });
    await act(() => result.current.reorder.cross(1));
    expect(result.current.reorder.preview).toEqual([LUNCH, WALK, SPA]);
    await act(() => result.current.reorder.cross(2));
    expect(result.current.reorder.preview).toEqual([LUNCH, SPA, WALK]);
    await act(() => result.current.reorder.cancel());
    expect(result.current.reorder.preview).toBeNull();
    expect(await queued(s, 'apply_plan_ops')).toHaveLength(0);
  });

  it('times the day again on drop and applies an organiser’s order', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useDayReorder(), { wrapper: s.wrapper });
    await loaded(result);
    await act(() => {
      result.current.reorder.lift(1);
    });
    await act(() => result.current.reorder.cross(0));
    let dropped: unknown;
    await act(async () => {
      dropped = await result.current.reorder.drop();
    });
    expect(dropped).toEqual({
      kind: 'sent',
      outcome: { kind: 'applied', opId: expect.any(String) },
    });
    const [sent] = await queued<ApplyPlanOpsPayload>(s, 'apply_plan_ops');
    const times = new Map(
      (sent?.ops ?? []).flatMap((op) =>
        op.op === 'move' && op.new.starts_at !== undefined
          ? [[op.item, local(op.new.starts_at)] as const]
          : [],
      ),
    );
    // Lunch takes the morning slot and the walk lunch's; the walk then runs to 16:30, so the spa
    // is pushed to after it and the leg.
    expect(times.get(LUNCH)).toBe(9 * 60);
    expect(times.get(WALK)).toBe(13 * 60);
    expect(times.get(SPA)).toBe(16 * 60 + 45);
    await waitFor(() =>
      expect(result.current.stops.map((stop) => stop.stableId)).toEqual([LUNCH, WALK, SPA]),
    );
  });

  it('turns a member’s order into a change set for the crew', async () => {
    const s = await seed('member');
    const { result } = await renderHook(() => useDayReorder(), { wrapper: s.wrapper });
    await loaded(result);
    await act(() => {
      result.current.reorder.lift(1);
    });
    await act(() => result.current.reorder.cross(0));
    let dropped: unknown;
    await act(async () => {
      dropped = await result.current.reorder.drop();
    });
    expect(dropped).toMatchObject({ kind: 'sent', outcome: { kind: 'proposed' } });
    expect(await queued(s, 'apply_plan_ops')).toHaveLength(0);
    const [set] = await queued<CreateChangesetPayload>(s, 'create_changeset');
    expect(set?.ops.map((op) => [op.op, op.target])).toEqual(
      expect.arrayContaining([
        ['retime', LUNCH],
        ['retime', WALK],
      ]),
    );
  });

  it('refuses to lift a booked stop, and an order that runs into it, sending nothing', async () => {
    const s = await seed('organiser', true);
    const { result } = await renderHook(() => useDayReorder(), { wrapper: s.wrapper });
    await loaded(result);
    await act(() => {
      expect(result.current.reorder.lift(2)).toMatchObject({
        ok: false,
        refusal: { kind: 'pinned', stop: { stableId: SPA } },
      });
    });
    // After lunch the walk runs to 16:30: past the spa booked at 16:00.
    await act(() => {
      result.current.reorder.lift(0);
    });
    await act(() => result.current.reorder.cross(1));
    let dropped: unknown;
    await act(async () => {
      dropped = await result.current.reorder.drop();
    });
    expect(dropped).toMatchObject({
      kind: 'refused',
      refusal: { kind: 'runs_into', stop: { stableId: SPA } },
    });
    expect(await queued(s, 'apply_plan_ops')).toHaveLength(0);
  });

  it('does nothing when a stop is dropped where it was lifted', async () => {
    const s = await seed('organiser');
    const { result } = await renderHook(() => useDayReorder(), { wrapper: s.wrapper });
    await loaded(result);
    await act(() => {
      result.current.reorder.lift(1);
    });
    let dropped: unknown;
    await act(async () => {
      dropped = await result.current.reorder.drop();
    });
    expect(dropped).toEqual({ kind: 'unchanged' });
    expect(await queued(s, 'apply_plan_ops')).toHaveLength(0);
  });
});
