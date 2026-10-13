/**
 * The delete page reads the server's preflight: Settle up only for a crew that owes you, what you
 * owe the others, the store that keeps billing Pass+ (with the way to cancel there), and plain
 * lists when the server could not say.
 */

import type { DeletionPreflight } from '@cp/domain';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { DeletePremiumScreen } from '../../premium/delete/delete-premium-screen';
import type { AccountServices } from '../account-services';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const OWED_CREW = '00000000-0000-4000-8000-000000000001';
const OWING_CREW = '00000000-0000-4000-8000-000000000002';

const BASE: DeletionPreflight = {
  instant: false,
  critters: 8,
  stamps: 3,
  balances: [
    { crew_id: OWED_CREW, crew_name: 'the Bali Six', currency: 'SGD', net_minor: 18640 },
    { crew_id: OWING_CREW, crew_name: 'Uni housemates', currency: 'SGD', net_minor: -5000 },
  ],
  organised_trips: [],
  active_trip: null,
  subscription: { source: 'app_store' },
};

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  jest.restoreAllMocks();
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function show(preflight: DeletionPreflight | null) {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const services: AccountServices = {
    readAccount: () =>
      Promise.resolve({ kind: 'ok', state: { status: 'registered', deletion: null } }),
    readPreflight: () => Promise.resolve(preflight),
    passSaved: () => Promise.resolve(true),
    clearPhone: () => Promise.resolve({ kind: 'restarting' }),
  };
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>
            <LocalFirstProvider value={stack.value}>
              <DeletePremiumScreen services={services} />
            </LocalFirstProvider>
          </ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('the delete page from the preflight', () => {
  it('offers Settle up only for the crew that owes you, and says what you owe', async () => {
    await show(BASE);
    expect(await screen.findByTestId(`you-delete-owed-${OWED_CREW}`)).toBeTruthy();
    expect(screen.queryByTestId(`you-delete-owed-${OWING_CREW}`)).toBeNull();
    expect(screen.getAllByTestId('you-delete-settle')).toHaveLength(1);
    expect(screen.getByText(/You’re owed S\$\s?186\.40/i)).toBeTruthy();
    expect(screen.getByText(/You owe Uni housemates S\$\s?50\.00/)).toBeTruthy();
  });

  it('names the store that keeps billing and links to cancel there; a gift bills nobody', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show(BASE);
    expect(await screen.findByText(/billed by the App Store/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-delete-manage-subscription'));
    expect(open).toHaveBeenCalledTimes(1);

    await show({ ...BASE, subscription: { source: 'gift' } });
    expect(screen.queryByTestId('you-delete-pass-plus')).toBeNull();
  });

  it('falls back to the plain lists when the server could not say', async () => {
    await show(null);
    expect(await screen.findByText(/Your pass, your critters and your stamps/)).toBeTruthy();
    expect(screen.queryByTestId('you-delete-settle')).toBeNull();
    expect(screen.queryByTestId('you-delete-preflight-lines')).toBeNull();
  });
});
