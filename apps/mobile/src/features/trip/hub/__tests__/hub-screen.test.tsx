/**
 * The hub over the real local-first stack with the Bali trip synced in: tapping Nudge on the
 * briefing queues `act_briefing_item` and the chip reads Sent at once (offline too); on another
 * of the crew's phones, where the acted row has synced back, the same line reads Sent.
 */
// The screen reaches the device database opener and the billing module, which Jest cannot load;
// it reads the test database through its provider.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
// The app's router double, with the zoom link's iOS views as plain wrappers.
jest.mock('expo-router', () => {
  const double = jest.requireActual<Record<string, unknown>>(
    '@/lib/navigation/test-support/expo-router-double',
  );
  const Pass = ({ children }: { readonly children?: unknown }) => children;
  return { ...double, Link: Object.assign(Pass, { AppleZoom: Pass, AppleZoomTarget: Pass }) };
});

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

import { TripHubPremium } from '../../premium/hub/TripHubPremium';
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
              <TripHubPremium tripId={tripId} onBack={() => undefined} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return stack;
}

describe('trip hub briefing', () => {
  it('queues the nudge and shows Sent at once', async () => {
    const stack = await renderHub();
    await waitFor(() => expect(screen.getByText('Nudge')).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`trip-briefing-chip-${NUDGE_ITEM}`));
    await waitFor(() => expect(screen.getByText('Sent')).toBeTruthy());
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
    expect(screen.queryByTestId('trip-briefing-skeleton')).toBeNull();
  });

  it('shows Sent where the nudge synced back from another phone', async () => {
    await renderHub('nudged');
    await waitFor(() => expect(screen.getByText('Sent')).toBeTruthy());
    expect(screen.queryByText('Nudge')).toBeNull();
  });
});

describe('trip hub for a trip still choosing its place', () => {
  it('asks where next, opens the vote on Home and reads every activity as copy', async () => {
    await renderHub(undefined, (stack) => seedFreshVote(stack.db, stack.uid), FRESH_TRIP);
    await waitFor(() => expect(screen.getByTestId('trip-hub')).toBeTruthy());
    expect(screen.getByText('Where next?')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByText('Khanh pitched a place').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('Khanh started the trip').length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/activity\./iu)).toEqual([]);
    await fireEvent.press(screen.getAllByText('Voting').at(-1)!);
    const { router } = jest.requireMock<{ router: { navigate: jest.Mock } }>('expo-router');
    expect(router.navigate).toHaveBeenLastCalledWith('/');
  });
});
