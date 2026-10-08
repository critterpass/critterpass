/**
 * The one plan reader picks the version a screen asks for: the crew's current version by default,
 * and, for the overview, an organiser's unproposed draft while the trip has no current version yet
 * (a member never sees it). The crew comes in join order, the active members marked apart.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { configure, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useTripPlan, type PlanVersionChoice } from '../use-trip-plan';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const LEFT = '0192f000-0000-7000-8000-0000000000a2';
const DRAFT = '0192f000-0000-7000-8000-000000000103';

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

async function seed(role: 'organiser' | 'member'): Promise<TestLocalFirst> {
  const s = await openTestLocalFirst({ holdUploads: true });
  stack = s;
  const { db, uid } = s;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  for (const [index, [member, status]] of [
    [LEFT, 'left'],
    [uid, 'active'],
    [MAYA, 'active'],
  ].entries()) {
    await db.execute(
      'INSERT INTO crew_members (id, crew_id, user_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [`cm-${index}`, CREW, member, status, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, draft_version_id) VALUES (?, ?, 'planning', ?)`,
    [TRIP, CREW, DRAFT],
  );
  await db.execute(
    'INSERT INTO trip_participants (id, trip_id, user_id, role) VALUES (?, ?, ?, ?)',
    ['tp-me', TRIP, uid, role],
  );
  await db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, 1, ?, ?)',
    ['draft-day', DRAFT, TRIP, '2026-10-12', 'Arrive'],
  );
  return s;
}

function read(s: TestLocalFirst, version?: PlanVersionChoice) {
  return renderHook(() => useTripPlan(TRIP, version === undefined ? {} : { version }), {
    wrapper: s.wrapper,
  });
}

describe('useTripPlan', () => {
  it("reads an organiser's draft for the overview while there is no current version", async () => {
    const s = await seed('organiser');
    const { result } = await read(s, 'draft-or-current');
    await waitFor(() => expect(result.current.dayRows).toHaveLength(1));
    expect(result.current.mode).toBe('draft');
    expect(result.current.versionId).toBe(DRAFT);
    expect(result.current.organiser).toBe(true);
  });

  it('reads only the current version by default, and never a draft for a member', async () => {
    const s = await seed('organiser');
    const current = await read(s);
    await waitFor(() => expect(current.result.current.loaded).toBe(true));
    expect(current.result.current.versionId).toBeNull();
    expect(current.result.current.mode).toBe('group');
    await current.unmount();
    await stack?.db.execute("UPDATE trip_participants SET role = 'member'");
    const member = await read(s, 'draft-or-current');
    await waitFor(() => expect(member.result.current.loaded).toBe(true));
    expect(member.result.current.versionId).toBeNull();
    expect(member.result.current.canApply).toBe(false);
  });

  it('keeps the whole crew in join order and counts colours among the active members', async () => {
    const s = await seed('member');
    const { result } = await read(s);
    await waitFor(() => expect(result.current.crew).toHaveLength(3));
    expect(result.current.crew.map((row) => row.user_id)).toEqual([LEFT, s.uid, MAYA]);
    expect(result.current.members.map((member) => [member.uid, member.joinIndex])).toEqual([
      [s.uid, 0],
      [MAYA, 1],
    ]);
  });
});
