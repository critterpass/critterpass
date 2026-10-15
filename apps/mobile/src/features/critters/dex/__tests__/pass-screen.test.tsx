/**
 * The PASS tab over the real local-first stack with a small Critterdex synced in: counts, the
 * here-now card, the home set and Explore at home, the trip egg and HATCH IT (queued offline),
 * the filters, and never a name for a critter the viewer hasn't verified.
 */
// NEAR ME's map draws on the plan's map canvas; its own suite covers it, here it stays out.
jest.mock('../../where/near-map', () => ({ NearMap: () => null }));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
// The map is a native view: NEAR ME's map renders its pins without it.
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    Map: ({ children }: { children: unknown }) => <View testID="maplibre-map">{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children: unknown }) => <View>{children}</View>,
    Marker: ({ children }: { children: unknown }) => <View>{children}</View>,
    GeoJSONSource: ({ children }: { children: unknown }) => <View>{children}</View>,
    Layer: () => null,
  };
});
let mockFocused = true;
let mockParams: { landed?: string } = {};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  usePathname: () => '/pass',
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
    canGoBack: () => false,
  },
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

import { PremiumDexScene } from '../../premium/dex/dex-scene';
import { PassScreen } from '../pass-screen';
import {
  CHEP,
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
  mockParams = {};
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
              <PassScreen View={PremiumDexScene} />
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
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    expect(screen.getByText('1 of 2 places')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Maya has 14')).toBeTruthy());
    expect(screen.getByText('Vietnam')).toBeTruthy();
    expect(screen.getByText('1/3 · home set')).toBeTruthy();
  });

  it('never renders the name of a critter the viewer has not verified', async () => {
    await renderPass();
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    // Tokek is only pending here: its name must not reach the screen, in any case.
    expect(screen.queryByText(/tokek/iu)).toBeNull();
    expect(screen.queryByLabelText(/tokek/iu)).toBeNull();
    expect(screen.getByText('0 of 4 forms')).toBeTruthy();
    expect(screen.getByLabelText('Chép')).toBeTruthy();
  });

  it('hides the comparison when the crewmate hides their collection', async () => {
    await renderPass({ mayaHidden: true });
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
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

  it('opens where to find a form not found yet from its silhouette in Here now', async () => {
    await renderPass();
    await waitFor(() => expect(screen.getByTestId('critters-here-now-rare')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('critters-here-now-rare'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/critters/where/[formId]',
      params: { formId: TOKEK_RARE },
    });
  });

  it('shows no egg card for a fresh account without an egg', async () => {
    await renderPass({ egg: 'none', fresh: true });
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    expect(screen.queryByTestId(/critters-egg-/u)).toBeNull();
  });

  it('turns Explore at home on through set_explore_at_home', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('Explore at home')).toBeTruthy());
    await fireEvent.press(screen.getByRole('switch'));
    await waitFor(async () =>
      expect(await queued(stack, 'set_explore_at_home')).toEqual([{ on: true }]),
    );
  });

  it('narrows to found critters and says so when there are none', async () => {
    await renderPass({ fresh: true });
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    await fireEvent.press(screen.getByText('Found'));
    await waitFor(() => expect(screen.getByTestId('critters-dex-empty')).toBeTruthy());
    expect(screen.getByText('Nothing befriended yet')).toBeTruthy();
    expect(screen.queryByTestId('critters-here-now')).toBeNull();
  });

  it('keeps the dex where it was while another screen or tab is in front', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    const list = screen.getByTestId('critters-dex-list');
    mockFocused = false;
    await screen.rerender(passTree(stack));
    // The same list stays mounted (its scroll offset with it), not a resting placeholder.
    expect(screen.getByTestId('critters-dex-list')).toBe(list);
    mockFocused = true;
    await screen.rerender(passTree(stack));
    expect(screen.getByTestId('critters-dex-list')).toBe(list);
  });

  it('brings the set a critter just landed in into view, then lets the landing go', async () => {
    mockParams = { landed: CHEP };
    await renderPass();
    await waitFor(() => expect(screen.getByTestId('critters-home-set')).toBeTruthy());
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ landed: undefined }));
  });

  it('says a find slipped away once the server revoked it, until OK', async () => {
    const stack = await renderPass();
    await waitFor(() => expect(screen.getByText('Here now · Bali')).toBeTruthy());
    expect(screen.queryByTestId('critters-slipped-away')).toBeNull();
    await stack.db.execute(
      `INSERT INTO encounters (id, user_id, trip_id, form_id, state, verification, verified_at)
       VALUES ('enc-slipped', ?, ?, ?, 'befriended', 'revoked', ?)`,
      [stack.uid, TRIP, TOKEK_RARE, new Date().toISOString()],
    );
    await waitFor(() => expect(screen.getByTestId('critters-slipped-away')).toBeTruthy());
    expect(screen.getByText('This one slipped away')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('critters-slipped-away-ok'));
    await waitFor(() => expect(screen.queryByTestId('critters-slipped-away')).toBeNull());
  });
});
