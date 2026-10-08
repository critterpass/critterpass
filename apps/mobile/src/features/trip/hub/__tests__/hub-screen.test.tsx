/**
 * The hub over the real local-first stack with the Bali trip synced in: tapping NUDGE on the
 * briefing queues `act_briefing_item` and the chip reads SENT at once (offline too); on another
 * of the crew's phones, where the acted row has synced back, the same line reads SENT.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
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

import { TripHubScreen } from '../screen';
import { NUDGE_ITEM, SEED_TRIP, seedTripDay } from '../test-support/seed-trip-day';
import { FRESH_TRIP, seedFreshVote } from '../test-support/seed-fresh-vote';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function renderHub(
  nudgeStatus?: string,
  seed: (stack: TestLocalFirst) => Promise<void> = (stack) =>
    seedTripDay(stack.db, stack.uid, nudgeStatus === undefined ? {} : { nudgeStatus }),
  tripId = SEED_TRIP,
): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seed(stack);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <TripHubScreen tripId={tripId} onSwitch={null} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return stack;
}

describe('trip hub briefing', () => {
  it('queues the nudge and shows SENT at once', async () => {
    const stack = await renderHub();
    await waitFor(() => expect(screen.getByText('NUDGE')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('trip-briefing-chip-nudge'));
    await waitFor(() => expect(screen.getByText('SENT')).toBeTruthy());
    const queued = await stack.db.getAll<{ envelope: string }>(
      "SELECT envelope FROM commands WHERE cmd = 'act_briefing_item'",
    );
    expect(queued.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload)).toEqual(
      [{ item_id: NUDGE_ITEM, action: 'nudge' }],
    );
  });

  it('settles on the guide saying nothing needs me when I have no briefing today', async () => {
    await renderHub(undefined, (stack) => seedTripDay(stack.db, stack.uid, { briefing: false }));
    await waitFor(() => expect(screen.getByTestId('trip-briefing-none')).toBeTruthy());
    expect(screen.queryByTestId('trip-briefing-loading')).toBeNull();
    expect(screen.getByTestId('trip-briefing-none-line')).toBeTruthy();
    // One trip on the account: nothing to switch to.
    expect(screen.queryByTestId('trip-hub-switch')).toBeNull();
  });

  it('shows SENT where the nudge synced back from another phone', async () => {
    await renderHub('nudged');
    await waitFor(() => expect(screen.getByText('SENT')).toBeTruthy());
    expect(screen.queryByText('NUDGE')).toBeNull();
  });
});

describe('trip hub for a trip still choosing its place', () => {
  it('asks where next, opens the vote on Home and reads every activity as copy', async () => {
    await renderHub(undefined, (stack) => seedFreshVote(stack.db, stack.uid), FRESH_TRIP);
    await waitFor(() => expect(screen.getByTestId('trip-hub')).toBeTruthy());
    expect(screen.getByText('WHERE NEXT?')).toBeTruthy();
    // Nobody is going anywhere yet: while the trip is being planned the header counts the crew.
    await waitFor(() => expect(screen.getByText('1 IN THE CREW')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getAllByText(/KHANH PITCHED A PLACE/u).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/KHANH STARTED THE TRIP/u).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/activity\./iu)).toEqual([]);
    await fireEvent.press(screen.getByTestId('trip-hub-planning-cta'));
    const { router } = jest.requireMock<{ router: { navigate: jest.Mock } }>('expo-router');
    expect(router.navigate).toHaveBeenLastCalledWith('/');
  });
});
