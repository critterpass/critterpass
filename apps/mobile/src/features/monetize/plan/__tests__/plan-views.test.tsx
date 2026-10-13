/**
 * Plan management promises: pause is offered to a monthly plan only, the payment page never shows
 * card details and says exactly what the server's rows say, and a plan billed by the other store
 * gets no buttons that would open the wrong one.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import type { Subscription } from '../../data/billing-rows';
import { BillingIssuePremiumView } from '../../premium/billing-issue-premium-view';
import { CancelPremiumView } from '../../premium/cancel-premium-view';
import { PlanPremiumView } from '../../premium/plan-premium-view';
import { planModel, type PlanInput } from '../plan-model';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  platform: 'app_store',
  productKey: 'pass_monthly',
  status: 'active',
  autoRenew: true,
  periodEnd: '2026-12-02T00:00:00Z',
  graceEndsAt: null,
  resumeAt: null,
  ...over,
});

const plan = (over: Partial<PlanInput> = {}) =>
  planModel({
    subscriptions: [sub({})],
    passPlus: true,
    passPlusUntil: null,
    deviceStore: 'app_store',
    ...over,
  });

async function show(view: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{view}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

const cancel = (over: Partial<PlanInput> = {}) => (
  <CancelPremiumView
    props={{
      plan: plan(over),
      store: 'app_store',
      nextTrip: null,
      perks: [],
      onPause: jest.fn(),
      onKeep: jest.fn(),
      onCancel: jest.fn(),
    }}
  />
);

describe('before cancelling', () => {
  it('offers the pause to a monthly plan', async () => {
    await show(cancel());
    expect(screen.getByTestId('plan-cancel-pause')).toBeTruthy();
    expect(screen.getByTestId('plan-cancel-pause-card')).toBeTruthy();
  });

  it('never offers a pause to a yearly plan: the year is already paid', async () => {
    await show(cancel({ subscriptions: [sub({ productKey: 'pass_yearly' })] }));
    expect(screen.queryByTestId('plan-cancel-pause')).toBeNull();
    expect(screen.getByTestId('plan-cancel-yearly')).toBeTruthy();
    expect(screen.getByTestId('plan-cancel-anyway')).toBeTruthy();
  });
});

describe('the card that did not go through', () => {
  const issue = (over: Partial<PlanInput>) => {
    const onUpdate = jest.fn();
    const onTryAgain = jest.fn();
    return {
      onUpdate,
      onTryAgain,
      view: (
        <BillingIssuePremiumView
          plan={plan(over)}
          boosts={[]}
          checking={false}
          onUpdate={onUpdate}
          onTryAgain={onTryAgain}
        />
      ),
    };
  };

  it('in grace, says Pass+ stays on until the grace end and shows no card details', async () => {
    const { view, onUpdate, onTryAgain } = issue({
      subscriptions: [sub({ status: 'grace', graceEndsAt: '2026-12-09T00:00:00Z' })],
    });
    await show(view);
    expect(within(screen.getByTestId('billing-issue-until')).getByText(/Dec/)).toBeTruthy();
    const text = JSON.stringify(screen.toJSON());
    // The store never tells us the card: no number, expiry or card name (the design's "Declined"
    // sticker is about the payment, not the card).
    expect(text).not.toMatch(/••|\bexp\b|expired|ending in|visa|mastercard/i);
    await fireEvent.press(screen.getByTestId('billing-issue-update'));
    await fireEvent.press(screen.getByTestId('billing-issue-try-again'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('after the grace, says Pass+ is off rather than promising a date', async () => {
    const { view } = issue({ subscriptions: [sub({ status: 'on_hold' })], passPlus: false });
    await show(view);
    expect(within(screen.getByTestId('billing-issue-until')).getByText('Off')).toBeTruthy();
  });

  it('shows the recovery once the server says the plan is healthy again', async () => {
    const { view } = issue({});
    await show(view);
    expect(screen.getByTestId('billing-issue-recovered')).toBeTruthy();
    expect(screen.queryByTestId('billing-issue-update')).toBeNull();
  });

  it('sends a plan billed by the other store there, with no update button here', async () => {
    const { view } = issue({ subscriptions: [sub({ status: 'grace', platform: 'play' })] });
    await show(view);
    expect(screen.queryByTestId('billing-issue-update')).toBeNull();
    expect(screen.getByTestId('billing-issue-elsewhere')).toBeTruthy();
  });
});

describe('your plan', () => {
  const view = (over: Partial<PlanInput>, storeAvailable = true) => {
    const model = plan(over);
    return (
      <PlanPremiumView
        props={{
          plan: model,
          price: null,
          boosts: [],
          restore: { status: 'idle' },
          storeAvailable,
          onUpgrade: jest.fn(),
          onManageStore: jest.fn(),
          onRestore: jest.fn(),
          onRedeem: jest.fn(),
          onCancel: jest.fn(),
          onBillingIssue: jest.fn(),
        }}
      />
    );
  };

  it('a renewing plan billed here can be cancelled and managed', async () => {
    await show(view({}));
    expect(screen.getByTestId('plan-summary')).toBeTruthy();
    expect(screen.getByTestId('plan-cancel')).toBeTruthy();
    expect(screen.getByTestId('plan-manage')).toBeTruthy();
  });

  it('a plan billed by the other store has no cancel here and says where to manage it', async () => {
    await show(view({ deviceStore: 'play' }));
    expect(screen.queryByTestId('plan-cancel')).toBeNull();
    expect(screen.getByTestId('plan-other-store')).toBeTruthy();
  });

  it('a free plan with no store says nothing can be bought here', async () => {
    await show(view({ subscriptions: [], passPlus: false }, false));
    expect(screen.getByTestId('plan-free')).toBeTruthy();
    expect(screen.getByTestId('plan-no-store')).toBeTruthy();
    expect(screen.queryByTestId('plan-manage')).toBeNull();
  });

  it('a failed renewal leads to the page that fixes it', async () => {
    await show(view({ subscriptions: [sub({ status: 'grace' })] }));
    expect(screen.getByTestId('plan-fix-payment')).toBeTruthy();
  });
});
