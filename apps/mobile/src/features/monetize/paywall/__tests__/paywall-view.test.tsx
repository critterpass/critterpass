/**
 * What the paywall lets someone do in each state: buy only with a store price, never pay twice
 * for a charge the server has not confirmed, and always see the renewal terms beside the button.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ProductOffer, ProductsState } from '@/data/billing';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import type { RestoreState } from '../../data/use-billing';
import { paywallModel, type PaywallInput } from '../paywall-model';
import { PaywallView } from '../paywall-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const offer = (key: ProductOffer['key'], priceString: string, price: number): ProductOffer => ({
  key,
  storeProductId: key,
  priceString,
  price,
  currencyCode: 'EUR',
  period: null,
  perMonthString: key === 'pass_yearly' ? 'EUR 2.50' : null,
  savingsPercent: key === 'pass_yearly' ? 37 : null,
});

const READY: ProductsState = {
  status: 'ready',
  offers: {
    pass_monthly: offer('pass_monthly', 'EUR 3.99', 3.99),
    pass_yearly: offer('pass_yearly', 'EUR 29.99', 29.99),
  },
};

async function show(input: Partial<PaywallInput> = {}, restore: RestoreState = { status: 'idle' }) {
  const handlers = {
    onBuy: jest.fn(),
    onCheckAgain: jest.fn(),
    onPlan: jest.fn(),
    onRestore: jest.fn(),
  };
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const model = paywallModel({
    products: READY,
    purchase: { status: 'idle' },
    period: 'yearly',
    passPlus: false,
    online: true,
    ...input,
  });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>
            <PaywallView
              model={model}
              holder="Winston"
              store="app_store"
              passPerks={[]}
              boostPerks={[]}
              firstTripFree={null}
              boostTrip={null}
              restore={restore}
              onPeriod={jest.fn()}
              onCompare={jest.fn()}
              onBoost={jest.fn()}
              onTerms={jest.fn()}
              onPrivacy={jest.fn()}
              {...handlers}
            />
          </ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return handlers;
}

describe('PaywallView', () => {
  it('buys the chosen plan and states its renewal terms with the store price', async () => {
    const { onBuy } = await show();
    expect(screen.getByTestId('paywall-disclosure-line').props.children).toContain('EUR 29.99');
    expect(screen.getByTestId('paywall-disclosure-line').props.children).toContain(
      'Renews automatically every year',
    );
    await fireEvent.press(screen.getByTestId('paywall-buy'));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it('says purchases are not available and cannot be pressed without a store price', async () => {
    await show({ products: { status: 'unavailable' } });
    expect(screen.getByTestId('paywall-phase-unavailable')).toBeTruthy();
    expect(screen.getByTestId('paywall-buy').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // Restore is still offered: a purchase made elsewhere can come back.
    expect(screen.getByTestId('paywall-restore')).toBeTruthy();
  });

  it('cannot start a second purchase while one waits on approval', async () => {
    await show({ purchase: { status: 'pending', productKey: 'pass_yearly' } });
    expect(screen.getByTestId('paywall-phase-pending')).toBeTruthy();
    expect(screen.getByTestId('paywall-buy').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('after a charge the server has not confirmed, offers a re-check and no buy button', async () => {
    const { onCheckAgain } = await show({
      purchase: {
        status: 'failed',
        productKey: 'pass_yearly',
        stage: 'verify',
        code: 'NETWORK',
        transactionId: 't',
      },
    });
    expect(screen.queryByTestId('paywall-buy')).toBeNull();
    await fireEvent.press(screen.getByTestId('paywall-check-again'));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('shows someone with Pass+ their plan instead of a purchase', async () => {
    const { onPlan } = await show({ passPlus: true });
    expect(screen.queryByTestId('paywall-buy')).toBeNull();
    expect(screen.queryByTestId('paywall-disclosure')).toBeNull();
    await fireEvent.press(screen.getByTestId('paywall-plan'));
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('tells apart a restore that found another account', async () => {
    await show({}, { status: 'done', result: { kind: 'other_account' } });
    expect(screen.getByTestId('paywall-restore-line').props.children).toContain(
      'another CritterPass account',
    );
  });
});
