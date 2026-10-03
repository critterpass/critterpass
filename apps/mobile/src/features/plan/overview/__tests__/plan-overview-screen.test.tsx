/**
 * The overview over the real local-first stack with the Bali week seeded as sync writes it: the
 * days render with their chips; an organiser's move queues one `reorder_days` on the version on
 * screen and shows the new order at once; a move that would shift a booked day queues nothing;
 * a member without a plan sees no setup action.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    Map: ({ children }: { children: unknown }) => <View testID="maplibre-map">{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children: unknown }) => <View>{children}</View>,
    GeoJSONSource: ({ children }: { children: unknown }) => <View>{children}</View>,
    Layer: () => null,
  };
});
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { PERSONAL_OPS_ID, PERSONAL_ROWS, SURF_LESSON } from '../../overlay/dev/personal-ops';
import { router } from 'expo-router';

import {
  BALI_DESTINATION,
  BALI_ITEMS,
  BALI_TRIP,
  BALI_VERSION,
  MAYA,
  WINSTON,
} from '../dev/bali-plan';
import { PlanOverviewScreen } from '../plan-overview-screen';
import { seedBaliPlan } from '../test-support/seed-plan';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function renderPlan(
  uid: string,
  options: Parameters<typeof seedBaliPlan>[2] = {},
): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ uid, holdUploads: true });
  await seedBaliPlan(stack.db, uid, options);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <PlanOverviewScreen tripId={BALI_TRIP} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return stack;
}

async function queuedOps(db: TestLocalFirst['db']) {
  const rows = await db.getAll<{ envelope: string }>(
    "SELECT envelope FROM commands WHERE cmd = 'apply_plan_ops' ORDER BY seq",
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

function dayRow(dayNo: number) {
  return screen.getByTestId(`plan-day-${dayNo}`);
}

describe('plan overview', () => {
  it('shows the week with its chips', async () => {
    await renderPlan(WINSTON);
    await screen.findByTestId('plan-day-7');
    expect(screen.getByText('BALI, DAY BY DAY')).toBeTruthy();
    const hidden = { includeHiddenElements: true };
    expect(screen.getAllByTestId('day-chip-booked', hidden)).toHaveLength(2);
    expect(screen.getAllByTestId('day-chip-vote', hidden)).toHaveLength(2);
    expect(screen.getByText('1 VOTE', hidden)).toBeTruthy();
    expect(screen.getByTestId('day-chip-rain', hidden)).toBeTruthy();
    // Screen readers hear the chip as part of the day.
    expect(screen.getByLabelText(/^Day 2, .*Ubud centre.*1 vote$/u)).toBeTruthy();
  });

  it('queues an organiser’s move and shows the new order at once', async () => {
    const { db } = await renderPlan(WINSTON);
    await screen.findByTestId('plan-day-7');
    const day2 = screen.getByLabelText(/^Day 2, .*Ubud centre/u);
    await fireEvent(day2, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    await waitFor(async () => expect(await queuedOps(db)).toHaveLength(1));
    expect((await queuedOps(db))[0]).toEqual({
      trip_id: BALI_TRIP,
      base_version: BALI_VERSION,
      ops: [{ op: 'reorder_days', new: { order: [1, 3, 2, 4, 5, 6, 7] } }],
      confirm_locked: false,
    });
    await waitFor(() => expect(screen.getByLabelText(/^Day 2, .*Slow Ubud/u)).toBeTruthy());
    expect(dayRow(3)).toBeTruthy();
  });

  it('never moves a booked day', async () => {
    const { db } = await renderPlan(WINSTON);
    await screen.findByTestId('plan-day-7');
    const day3 = screen.getByLabelText(/^Day 3, .*Slow Ubud/u);
    await fireEvent(day3, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await queuedOps(db)).toEqual([]);
    expect(screen.getByLabelText(/^Day 4, .*Batur sunrise/u)).toBeTruthy();
  });

  it('shows my own plan and keeps my version of a clashing change', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    const { db } = stack;
    await seedBaliPlan(db, WINSTON);
    await db.execute(
      `INSERT INTO personal_plan_ops (id, trip_id, user_id, base_version_id, ops, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', '2026-10-01T00:00:00Z')`,
      [PERSONAL_OPS_ID, BALI_TRIP, WINSTON, BALI_VERSION, PERSONAL_ROWS[0]?.ops],
    );
    await db.execute('INSERT INTO pois (id, destination_id, name, category) VALUES (?, ?, ?, ?)', [
      SURF_LESSON,
      BALI_DESTINATION,
      'Surf lesson',
      'beach',
    ]);
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <LocalFirstProvider value={stack.value}>
              <ScreenJoltProvider>
                <PlanOverviewScreen tripId={BALI_TRIP} />
              </ScreenJoltProvider>
            </LocalFirstProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    await screen.findByTestId('plan-day-3-just-you');
    // The place names arrive on their own local query, after the day cards.
    expect(await screen.findByLabelText(/^Day 3, .*Surf lesson/u)).toBeTruthy();
    // The kecak dance I skip is gone from my week.
    expect(await screen.findByLabelText(/^Day 7, .*Beach clubs, Beach weather/u)).toBeTruthy();
    expect(screen.queryByLabelText(/Kecak/u)).toBeNull();
    await fireEvent.press(await screen.findByTestId(/^plan-clash-keep-/u));
    await waitFor(async () => {
      const rows = await db.getAll<{ envelope: string }>(
        "SELECT envelope FROM commands WHERE cmd = 'resolve_overlay_clash'",
      );
      expect(rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload)).toEqual(
        [{ personal_ops_id: PERSONAL_OPS_ID, keep: true }],
      );
    });
  });

  it('opens an item from its map pin and a day from the calendar', async () => {
    await renderPlan(WINSTON);
    await screen.findByTestId('plan-day-7');
    await fireEvent.press(screen.getByText('MAP'));
    const pin = await screen.findByLabelText('Day 3, stop 2: Spa');
    await fireEvent.press(pin);
    const spa = BALI_ITEMS.find((item) => item.label === 'Spa')?.stableId ?? '';
    expect(router.push).toHaveBeenLastCalledWith(`/${BALI_TRIP}/day/3?item=${spa}`);
    await fireEvent.press(screen.getByText('CALENDAR'));
    await fireEvent.press(await screen.findByTestId('plan-calendar-day-4'));
    expect(router.push).toHaveBeenLastCalledWith(`/${BALI_TRIP}/day/4`);
  });

  it('tells a member without a plan to wait for the organiser', async () => {
    await renderPlan(MAYA, { role: 'member', withPlan: false });
    await screen.findByTestId('plan-empty');
    expect(screen.queryByText('Set up the trip')).toBeNull();
  });
});
