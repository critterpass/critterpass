/**
 * The PASS tab over the real local-first stack with a small Critterdex synced in: counts, the
 * here-now card, the home set and Explore at home, the trip egg and HATCH IT (queued offline),
 * the filters, and never a name for a critter the viewer hasn't verified.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
let mockFocused = true;
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  usePathname: () => '/pass',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { PassScreen } from '../pass-screen';
import {
  seedCritters,
  TOKEK_RARE,
  TRIP,
  type CritterSeedOptions,
} from '../../test-support/seed-critters';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  mockFocused = true;
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function renderPass(options: CritterSeedOptions = {}): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid, options);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(passTree(stack));
  await waitFor(() => expect(screen.getByTestId('critters-dex')).toBeTruthy());
  return stack;
}

function passTree(stack: TestLocalFirst) {
  return (
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <PassScreen />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>
  );
}

async function queued(stack: TestLocalFirst, cmd: string): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ?',
    [cmd],
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

describe('PASS tab Critterdex', () => {
  it('shows counts, the here-now card, the home set and Maya’s count', async () => {
    await renderPass();
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    expect(screen.getByText('1 OF 2 PLACES')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Maya has 14')).toBeTruthy());
    expect(screen.getByText('VIETNAM')).toBeTruthy();
    expect(screen.getByText('1/3 · HOME SET')).toBeTruthy();
  });

  it('never renders the name of a critter the viewer has not verified', async () => {
    await renderPass();
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    // Tokek is only pending here: its name must not reach the screen, in any case.
    expect(screen.queryByText(/tokek/iu)).toBeNull();
    expect(screen.queryByLabelText(/tokek/iu)).toBeNull();
    expect(screen.getByText('??? · 0 OF 4 FORMS')).toBeTruthy();
    expect(screen.getByLabelText('Chép')).toBeTruthy();
  });

  it('hides the comparison when the crewmate hides their collection', async () => {
    await renderPass({ mayaHidden: true });
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    expect(screen.queryByText(/Maya/u)).toBeNull();
  });

  it('shows the waiting egg before the trip, with no way to hatch it', async () => {
    await renderPass({ tripStatus: 'pre_trip' });
    await waitFor(() => expect(screen.getByTestId('critters-egg-waiting')).toBeTruthy());
    expect(screen.queryByTestId('critters-egg-hatch')).toBeNull();
    expect(screen.getByText('It hatches when you land in Bali.')).toBeTruthy();
  });

  it('queues hatch_egg by hand once the trip is under way and opens the ceremony', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByTestId('critters-egg-hatch')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('critters-egg-hatch'));
    await waitFor(async () =>
      expect(await queued(stack, 'hatch_egg')).toEqual([{ trip_id: TRIP, trigger: 'manual' }]),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(modal)/hatch/[tripId]',
      params: { tripId: TRIP },
    });
  });

  it('shows no egg card for a fresh account without an egg', async () => {
    await renderPass({ egg: 'none', fresh: true });
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    expect(screen.queryByTestId(/critters-egg-/u)).toBeNull();
  });

  it('turns Explore at home on through set_explore_at_home', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('Explore at home')).toBeTruthy());
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    await waitFor(async () =>
      expect(await queued(stack, 'set_explore_at_home')).toEqual([{ on: true }]),
    );
  });

  it('narrows to found critters and says so when there are none', async () => {
    await renderPass({ fresh: true });
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('FOUND'));
    await waitFor(() => expect(screen.getByTestId('critters-dex-empty')).toBeTruthy());
    expect(screen.getByText('NOTHING BEFRIENDED YET')).toBeTruthy();
    expect(screen.queryByTestId('critters-here-now')).toBeNull();
  });

  it('stops drawing the dex while another screen is in front, and draws it again on return', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    mockFocused = false;
    await screen.rerender(passTree(stack));
    expect(screen.getByTestId('critters-dex-resting')).toBeTruthy();
    expect(screen.queryByTestId('critters-dex')).toBeNull();
    mockFocused = true;
    await screen.rerender(passTree(stack));
    // The rows stayed loaded: the dex is back in the same render, with no loading state between.
    expect(screen.getByTestId('critters-dex')).toBeTruthy();
    expect(screen.getByText('HERE NOW · BALI')).toBeTruthy();
  });

  it('says a find slipped away once the server revoked it, until OK', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('HERE NOW · BALI')).toBeTruthy());
    expect(screen.queryByTestId('critters-slipped-away')).toBeNull();
    await stack.db.execute(
      `INSERT INTO encounters (id, user_id, trip_id, form_id, state, verification, verified_at)
       VALUES ('enc-slipped', ?, ?, ?, 'befriended', 'revoked', ?)`,
      [stack.uid, TRIP, TOKEK_RARE, new Date().toISOString()],
    );
    await waitFor(() => expect(screen.getByTestId('critters-slipped-away')).toBeTruthy());
    expect(screen.getByText('THIS ONE SLIPPED AWAY')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('critters-slipped-away-ok'));
    await waitFor(() => expect(screen.queryByTestId('critters-slipped-away')).toBeNull());
  });
});
