/**
 * What the delete page promises from the server's preflight: a card with Settle up only for a crew
 * that owes you, a line for what you owe, the store that keeps billing, and the instant-erase
 * warning for a pass with no way back in.
 */

import type { DeletionPreflight } from '@cp/domain';
import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { DeleteView } from '../delete-view';

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

async function show(preflight: DeletionPreflight | null, passPlus = false) {
  const onSettle = jest.fn();
  const onManage = jest.fn();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>
            <DeleteView
              step="review"
              online
              busy={false}
              passPlus={passPlus}
              preflight={preflight}
              reason={null}
              problem={null}
              onContinue={jest.fn()}
              onReason={jest.fn()}
              onDelete={jest.fn()}
              onKeep={jest.fn()}
              onSettle={onSettle}
              onManageSubscription={onManage}
            />
          </ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return { onSettle, onManage };
}

describe('the delete page from the preflight', () => {
  it('offers Settle up only for the crew that owes you, and says what you owe', async () => {
    const { onSettle } = await show(BASE);
    expect(screen.getByTestId(`you-delete-owed-${OWED_CREW}`)).toBeTruthy();
    expect(screen.queryByTestId(`you-delete-owed-${OWING_CREW}`)).toBeNull();
    expect(screen.getByText(/You’re owed S\$\s?186\.40/i)).toBeTruthy();
    expect(screen.getByText(/You owe Uni housemates S\$\s?50\.00/)).toBeTruthy();
    expect(screen.getByText('Your pass, your 8 critters and your stamps')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-delete-settle'));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('names the store that keeps billing and links to cancel there; a gift bills nobody', async () => {
    const { onManage } = await show(BASE);
    expect(screen.getByText(/billed by the App Store/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-delete-manage-subscription'));
    expect(onManage).toHaveBeenCalledTimes(1);

    await show({ ...BASE, subscription: { source: 'gift' } }, true);
    expect(screen.queryByTestId('you-delete-pass-plus')).toBeNull();
  });

  it('falls back to the plain lists when the server could not say', async () => {
    await show(null, true);
    expect(screen.getByText('Your pass, your critters and your stamps')).toBeTruthy();
    expect(screen.queryByTestId('you-delete-settle')).toBeNull();
    expect(screen.getByText(/billed by the store you bought it from/)).toBeTruthy();
  });
});
