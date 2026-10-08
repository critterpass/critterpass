/**
 * The hatch ceremony's eyebrow over the real local-first stack: after a landing it names the
 * airport the traveller's own leg arrived at, never a crewmate's leg, and without a flight it
 * keeps just the time.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, configure, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { MAYA, seedCritters, TRIP } from '../../test-support/seed-critters';
import { HatchScreen, MISSING_GRACE_MS } from '../hatch-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const LANDED = '2026-10-01T05:50:00Z';
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function leg(
  stack: TestLocalFirst,
  id: string,
  traveller: string,
  airport: string,
  arrivedAt: string,
) {
  await stack.db.execute(
    `INSERT INTO bookings (id, trip_id, owner_id, type, traveller_ids) VALUES (?, ?, ?, 'flight', ?)`,
    [`b-${id}`, TRIP, traveller, JSON.stringify([traveller])],
  );
  await stack.db.execute(
    `INSERT INTO flight_segments (id, booking_id, trip_id, owner_id, arr_airport, act_arr_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, `b-${id}`, TRIP, traveller, airport, arrivedAt],
  );
}

async function openStack(bound = false) {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  if (bound) {
    // Signed in on this phone, with none of the trip's rows synced yet.
    await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      stack.uid,
    ]);
  }
  return stack;
}

async function mount(stack: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <HatchScreen tripId={TRIP} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

async function renderHatch(withFlights: boolean) {
  const stack = await openStack();
  await seedCritters(stack.db, stack.uid, { egg: 'hatched' });
  await stack.db.execute('UPDATE trip_participants SET landed_at = ? WHERE user_id = ?', [
    LANDED,
    stack.uid,
  ]);
  if (withFlights) {
    await leg(stack, 'seg-mine', stack.uid, 'DPS', LANDED);
    // A crewmate's leg landing at the same moment elsewhere is not mine.
    await leg(stack, 'seg-maya', MAYA, 'SIN', LANDED);
  }
  await mount(stack);
  await waitFor(() => expect(screen.getByTestId('critters-hatch')).toBeTruthy());
}

function wait(ms: number) {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

describe('hatch eyebrow', () => {
  it('names the airport my own leg landed at', async () => {
    await renderHatch(true);
    await waitFor(() =>
      expect(screen.getByText(/^DPS · \d\d:\d\d( [AP]M)? · YOU LANDED$/u)).toBeTruthy(),
    );
    expect(screen.queryByText(/SIN/u)).toBeNull();
  });

  it('keeps just the time without a flight', async () => {
    await renderHatch(false);
    await waitFor(() =>
      expect(screen.getByText(/^\d\d:\d\d( [AP]M)? · YOU LANDED$/u)).toBeTruthy(),
    );
  });
});

describe('hatch ceremony without its trip yet', () => {
  afterEach(() => {
    jest.mocked(router.back).mockClear();
  });

  it('stays open while the trip rows are a sync away, then shows the ceremony', async () => {
    const stack = await openStack(true);
    await mount(stack);
    await waitFor(() => expect(screen.getByTestId('critters-hatch-loading')).toBeTruthy());
    await wait(MISSING_GRACE_MS / 2);
    await seedCritters(stack.db, stack.uid, { egg: 'hatched' });
    await waitFor(() => expect(screen.getByTestId('critters-hatch')).toBeTruthy());
    await wait(MISSING_GRACE_MS);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('leaves when the trip never reaches this phone', async () => {
    const stack = await openStack(true);
    await mount(stack);
    await waitFor(() => expect(screen.getByTestId('critters-hatch-loading')).toBeTruthy());
    expect(router.back).not.toHaveBeenCalled();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), {
      timeout: MISSING_GRACE_MS + 2000,
    });
  });
});
