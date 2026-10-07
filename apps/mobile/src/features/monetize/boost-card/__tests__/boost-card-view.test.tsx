/**
 * What the crew's boost card lets each person do: a member who owes a share can settle it and
 * thank the buyer once, the buyer gets neither, a refunded boost offers nothing, and the stamp
 * offers TELL THE CREW only to a buyer with a crew to tell, once.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Idle loops ask the router whether their screen is focused.
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { StampedView } from '../../boost/stamped-view';
import { boostCardModel, type CardBoost, type CardInput } from '../boost-card-model';
import { BoostCardView } from '../boost-card-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function show(ui: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={METRICS}>
        <I18nProvider i18n={i18n}>
          <ScreenJoltProvider>{ui}</ScreenJoltProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

const boost = (over: Partial<CardBoost> = {}): CardBoost => ({
  id: 'b1',
  buyerId: 'winston',
  status: 'active',
  split: true,
  splitMemberIds: ['winston', 'maya'],
  thankedBy: [],
  ...over,
});

async function card(over: Partial<CardInput> = {}) {
  const onSettle = jest.fn();
  const onThanks = jest.fn();
  const model = boostCardModel({
    viewerUid: 'maya',
    boost: boost(),
    shares: [
      { userId: 'winston', name: 'Winston', minor: 600, currency: 'USD' },
      { userId: 'maya', name: 'Maya', minor: 599, currency: 'USD' },
    ],
    expense: { id: 'e1', ledgerCurrency: 'USD' },
    ledger: [
      {
        debtorId: 'maya',
        creditorId: 'winston',
        minor: 599,
        currency: 'USD',
        sourceKind: 'boost_iou',
        sourceId: 'e1',
      },
    ],
    payments: [],
    ...over,
  });
  await show(
    <BoostCardView
      model={model}
      buyer="Winston"
      destination="Kyoto"
      dates="Apr 2–16"
      perks={[]}
      share={model.kind === 'live' && model.share !== null ? '$5.99' : null}
      guide={null}
      onSettle={onSettle}
      onThanks={onThanks}
    />,
  );
  return { onSettle, onThanks };
}

describe('the crew boost card', () => {
  it('lets a member who owes settle their share and thank the buyer', async () => {
    const { onSettle, onThanks } = await card();
    await fireEvent.press(screen.getByTestId('boost-card-settle'));
    await fireEvent.press(screen.getByTestId('boost-card-thanks'));
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onThanks).toHaveBeenCalledTimes(1);
  });

  it('gives the buyer the count still to go and no buttons', async () => {
    await card({ viewerUid: 'winston' });
    expect(screen.getByTestId('boost-card-to-go')).toBeTruthy();
    expect(screen.queryByTestId('boost-card-settle')).toBeNull();
    expect(screen.queryByTestId('boost-card-thanks')).toBeNull();
  });

  it('offers the thanks once', async () => {
    await card({ boost: boost({ thankedBy: ['maya'] }) });
    expect(screen.queryByTestId('boost-card-thanks')).toBeNull();
    expect(screen.getByTestId('boost-card-thanked')).toBeTruthy();
  });

  it('asks nobody to settle a refunded boost', async () => {
    await card({ boost: boost({ status: 'revoked' }) });
    expect(screen.getByTestId('boost-card-gone')).toBeTruthy();
    expect(screen.queryByTestId('boost-card-settle')).toBeNull();
    expect(screen.queryByTestId('boost-card-thanks')).toBeNull();
  });
});

describe('telling the crew from the stamp', () => {
  const stamp = (over: { onTell?: () => void; told?: boolean; boosted?: boolean }) =>
    show(
      <StampedView
        boosted={over.boosted ?? true}
        destination="Kyoto"
        crew="The Bali Six"
        window="Apr 2–16"
        split
        owing={[{ uid: 'maya', name: 'Maya' }]}
        eachShare="$5.99"
        {...(over.onTell === undefined ? {} : { onTell: over.onTell })}
        told={over.told ?? false}
        onDone={() => undefined}
      />,
    );

  it('posts once, and not again once the crew knows', async () => {
    const onTell = jest.fn();
    const first = await stamp({ onTell });
    await fireEvent.press(screen.getByTestId('stamped-tell'));
    expect(onTell).toHaveBeenCalledTimes(1);
    await first.unmount();
    await stamp({ onTell, told: true });
    await fireEvent.press(screen.getByTestId('stamped-tell'));
    expect(onTell).toHaveBeenCalledTimes(1);
  });

  it('is not offered before the boost is on, or with nobody to tell', async () => {
    const pending = await stamp({ onTell: () => undefined, boosted: false });
    expect(screen.queryByTestId('stamped-tell')).toBeNull();
    await pending.unmount();
    await stamp({});
    expect(screen.queryByTestId('stamped-tell')).toBeNull();
    expect(screen.getByTestId('stamped-done')).toBeTruthy();
  });
});
