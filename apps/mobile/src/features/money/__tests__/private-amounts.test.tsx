/**
 * A problem report's screenshot never shows what the crew spent or who owes what: with the mask up,
 * every amount on Balances, an expense, Settle up and a payment sits under a cover, while the
 * screen's headings stay readable.
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
  router: { replace: () => undefined, back: () => undefined, push: () => undefined },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { HOME_SCENES } from '../dev/lab-scenes-home';
import { SETTLE_SCENES } from '../dev/lab-scenes-settle';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function scene(scenes: Readonly<Record<string, () => ReactNode>>, name: string): ReactElement {
  const render = scenes[name];
  if (render === undefined) throw new Error(`missing scene ${name}`);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{render()}</ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

describe('money in a problem report screenshot', () => {
  it('covers the balance, the bars, the total and the latest expense on Balances', async () => {
    await renderUi(scene(HOME_SCENES, 'balances'));
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('money-hero-amount'))).toBe(true);
      expect(isCovered(screen.getByText(/^MONEY · .* SPENT$/u))).toBe(true);
      const bars = within(screen.getByTestId('money-bars'));
      expect(bars.getAllByTestId('private-content-cover').length).toBeGreaterThan(0);
      expect(isCovered(screen.getByText(/paid/u))).toBe(true);
      expect(isCovered(screen.getByText('LATEST'))).toBe(false);
      expect(isCovered(screen.getByTestId('money-settle'))).toBe(false);
    });
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
  });

  it('covers the amount and every share on an expense', async () => {
    await renderUi(scene(HOME_SCENES, 'expense'));
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('money-detail-amount'))).toBe(true);
      const shares = within(screen.getByTestId('money-detail-shares'));
      expect(shares.getAllByTestId('private-content-cover').length).toBeGreaterThan(0);
    });
  });

  it('covers each payment on Settle up and the amount on a payment', async () => {
    await renderUi(scene(SETTLE_SCENES, 'settle'));
    await whileMasked(() => {
      const rows = screen.getAllByTestId(/^money-settle-row-/u);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(isCovered(row)).toBe(true);
      expect(isCovered(screen.getByText('SETTLE UP'))).toBe(false);
    });
    await screen.unmount();
    await renderUi(scene(SETTLE_SCENES, 'payment-payer'));
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('money-payment-amount'))).toBe(true);
    });
  });
});
