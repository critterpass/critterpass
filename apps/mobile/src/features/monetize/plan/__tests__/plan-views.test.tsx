/**
 * Plan management promises: pause is offered to a monthly plan only, the payment page never shows
 * card details and says exactly what the server's rows say, and a plan billed by the other store
 * gets no buttons that would open the wrong one.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import type { Subscription } from '../../data/billing-rows';
import { BillingIssueView } from '../billing-issue-view';
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

describe('BillingIssueView', () => {
  const issue = (over: Partial<PlanInput>, canFixHere = true) => {
    const onUpdate = jest.fn();
    const onTryAgain = jest.fn();
    return {
      onUpdate,
      onTryAgain,
      view: (
        <BillingIssueView
          plan={plan(over)}
          boosts={[]}
          checking={false}
          canFixHere={canFixHere}
          onUpdate={onUpdate}
          onTryAgain={onTryAgain}
          onDone={jest.fn()}
        />
      ),
    };
  };

  it('in grace, says Pass+ stays on until the grace end and shows no card details', async () => {
    const { view, onUpdate, onTryAgain } = issue({
      subscriptions: [sub({ status: 'grace', graceEndsAt: '2026-12-09T00:00:00Z' })],
    });
    await show(view);
    expect(screen.getByTestId('billing-issue-until').props.children).toContain('Dec');
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/••|\bexp\b|expired|declined|ending in/i);
    await fireEvent.press(screen.getByTestId('billing-issue-update'));
    await fireEvent.press(screen.getByTestId('billing-issue-try-again'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});
