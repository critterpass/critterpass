/**
 * A change that makes a new plan version (an edit, an undo, a skip "just me") never blanks the
 * plan: while the new version's rows arrive, the plan read before stays on screen, loaded, and then
 * the new one takes its place. Over the real local database.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { configure, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { changedSince, holdThroughSwitch, useTripPlan, type TripPlan } from '../use-trip-plan';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const V2 = '0192f000-0000-7000-8000-000000000102';

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

async function addVersion(s: TestLocalFirst, version: string, theme: string) {
  await s.db.execute(
    'INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, 1, ?, ?)',
    [`day-${version}`, version, TRIP, '2026-10-14', theme],
  );
}

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('a new plan version', () => {
  it('keeps the plan read before on screen until its rows are in', async () => {
    const s = await openTestLocalFirst({ holdUploads: true });
    stack = s;
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await s.db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES ('cm-0', ?, ?, 'active', '2026-09-01T00:00:00Z')`,
      [CREW, s.uid],
    );
    await s.db.execute(
      `INSERT INTO trips (id, crew_id, status, current_version_id) VALUES (?, ?, 'planned', ?)`,
      [TRIP, CREW, V1],
    );
    await addVersion(s, V1, 'Before');
    await addVersion(s, V2, 'After');
    const seen: { loaded: boolean; theme: string | null | undefined }[] = [];
    const { result } = await renderHook(
      () => {
        const plan = useTripPlan(TRIP);
        seen.push({ loaded: plan.loaded, theme: plan.dayRows[0]?.theme });
        return plan;
      },
      { wrapper: s.wrapper },
    );
    await waitFor(() => expect(result.current.dayRows[0]?.theme).toBe('Before'));
    const from = seen.length;
    await s.db.execute('UPDATE trips SET current_version_id = ? WHERE id = ?', [V2, TRIP]);
    await waitFor(() => expect(result.current.dayRows[0]?.theme).toBe('After'));
    const during = seen.slice(from);
    // It settles: no render loop while it holds or after.
    expect(seen.length).toBeLessThan(40);
    expect(during.every((render) => render.loaded)).toBe(true);
    expect(during.every((render) => render.theme === 'Before' || render.theme === 'After')).toBe(
      true,
    );
  });
});

describe('holdThroughSwitch', () => {
  const plan = (over: Partial<TripPlan>) =>
    ({ loaded: true, versionId: V1, trip: { id: TRIP }, ...over }) as TripPlan;

  it('lets a first load, another trip and a plan that goes away through', () => {
    const loading = plan({ loaded: false, versionId: V2 });
    expect(holdThroughSwitch(null, loading)).toBe(loading);
    const elsewhere = plan({ loaded: false, versionId: V2, trip: { id: 'other' } as never });
    expect(holdThroughSwitch(plan({}), elsewhere)).toBe(elsewhere);
    const gone = plan({ loaded: false, versionId: null });
    expect(holdThroughSwitch(plan({}), gone)).toBe(gone);
  });
});

describe('changedSince', () => {
  it('reads the same plan as unchanged while the crew and change sets are still arriving', () => {
    const rows = { trip: { id: TRIP }, dayRows: [], itemRows: [] };
    const first = { ...rows, versionId: V1, crew: [], openChangesets: [] } as unknown as TripPlan;
    // A render later the lists still loading are new empty lists: that is no change.
    const again = { ...first, crew: [], openChangesets: [] } as unknown as TripPlan;
    expect(changedSince(first, again)).toBe(false);
    expect(changedSince(first, { ...first, versionId: V2 })).toBe(true);
    expect(changedSince(null, first)).toBe(true);
  });
});
