/**
 * The device calendar sync over the real local-first stack and the real permission orchestrator.
 * The OS is the boundary: the calendar reader and the permission port are doubles, the day
 * reduction itself runs natively (modules/cp-calendar tests cover it).
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { PermissionKind } from '@cp/domain';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import {
  createPermissionStore,
  type KeyValueStorage,
  type PermissionReport,
} from '@/lib/permissions';
import { configurePermissions, registerPrimerPresenter } from '@/lib/permissions/use-permission';

import { DeviceCalendarProvider, type DeviceCalendar } from '../device-calendar';
import { resetCalendarPrefs } from '../prefs';
import { useCalendarSync } from '../use-calendar-sync';

const TRIP = '0199a6f0-0000-7000-8000-00000000c001';
const NOW = Date.parse('2026-10-02T00:41:00Z');

let stack: TestLocalFirst | null = null;
let stopPrimer: (() => void) | null = null;

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  };
}

function report(kind: PermissionKind, status: PermissionReport['status'], canAskAgain = true) {
  return { kind, status, canAskAgain, available: true };
}

/** The OS: calendar access as the test sets it; a request grants unless told to refuse. */
function os(initial: PermissionReport['status'], refuse = false) {
  const state = { status: initial };
  configurePermissions({
    port: {
      getStatus: (kind) =>
        Promise.resolve(
          kind === 'calendar'
            ? report(kind, state.status, state.status !== 'denied')
            : report(kind, 'not_determined'),
        ),
      request(kind) {
        if (kind === 'calendar' && !refuse) state.status = 'granted';
        if (kind === 'calendar' && refuse) state.status = 'denied';
        return Promise.resolve(report(kind, state.status, state.status !== 'denied'));
      },
      openSettings: () => Promise.resolve(true),
      settingsTargetFor: () => 'app',
    },
    sendMirror: () => Promise.resolve(),
    storage: memoryStorage(),
    store: createPermissionStore(memoryStorage()),
  });
  stopPrimer = registerPrimerPresenter(() => Promise.resolve('accept'));
  return state;
}

function calendar(access: { status: string }): DeviceCalendar & { reads: boolean[] } {
  const reads: boolean[] = [];
  return {
    reads,
    isAvailable: () => true,
    hasAccess: () => access.status === 'granted',
    readBusyDays: (_range, includeTentative) => {
      reads.push(includeTentative);
      return Promise.resolve([
        { date: '2026-10-02', state: 'free' },
        { date: '2026-10-03', state: 'busy' },
        { date: '2026-10-04', state: 'maybe' },
      ]);
    },
  };
}

async function queued(db: TestLocalFirst['db']) {
  const rows = await db.getAll<{ cmd: string; envelope: string }>(
    'SELECT cmd, envelope FROM commands ORDER BY seq',
  );
  return rows.map((row) => ({
    cmd: row.cmd,
    payload: (JSON.parse(row.envelope) as { payload: unknown }).payload,
  }));
}

function render(device: DeviceCalendar) {
  const current = stack!;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <current.wrapper>
      <DeviceCalendarProvider calendar={device}>{children}</DeviceCalendarProvider>
    </current.wrapper>
  );
  return renderHook(() => useCalendarSync(TRIP, { now: () => NOW }), { wrapper });
}

beforeEach(async () => {
  resetCalendarPrefs();
  stack = await openTestLocalFirst({ holdUploads: true });
});

afterEach(async () => {
  stopPrimer?.();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('device calendar sync', () => {
  it('with access, sends only dates, states and the source, and no maybe without consent', async () => {
    const access = os('granted');
    const device = calendar(access);
    const { result } = await render(device);

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(device.reads).toEqual([false]);
    const [sent] = await queued(stack!.db);
    expect(sent).toEqual({
      cmd: 'set_availability',
      payload: {
        trip_id: TRIP,
        days: [
          { date: '2026-10-02', state: 'free', source: 'device_cal' },
          { date: '2026-10-03', state: 'busy', source: 'device_cal' },
        ],
        consent_tentative: false,
      },
    });
  });

  it('shares maybe days once the member opts in', async () => {
    const device = calendar(os('granted'));
    const { result } = await render(device);
    await waitFor(() => expect(result.current.status).toBe('synced'));

    await act(() => result.current.setTentative(true));
    await waitFor(async () => expect(await queued(stack!.db)).toHaveLength(2));
    const last = (await queued(stack!.db))[1]?.payload as {
      days: { state: string }[];
      consent_tentative: boolean;
    };
    expect(last.consent_tentative).toBe(true);
    expect(last.days.map((day) => day.state)).toEqual(['free', 'busy', 'maybe']);
  });

  it('asks through the primer, then syncs', async () => {
    const access = os('not_determined');
    const device = calendar(access);
    const { result } = await render(device);
    expect(result.current.status).toBe('needs_permission');
    expect(device.reads).toEqual([]);

    await act(async () => result.current.connect());
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(await queued(stack!.db)).toHaveLength(1);
  });

  it('never reads the calendar when access is refused, leaving marking by hand', async () => {
    const access = os('not_determined', true);
    const device = calendar(access);
    const { result } = await render(device);

    await act(async () => result.current.connect());
    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(device.reads).toEqual([]);
    expect(await queued(stack!.db)).toEqual([]);
  });

  it('is unavailable without the on-device reader', async () => {
    os('granted');
    const { result } = await render({
      ...calendar({ status: 'granted' }),
      isAvailable: () => false,
    });
    expect(result.current.status).toBe('unavailable');
  });
});
