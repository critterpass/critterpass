/**
 * A problem report's screenshot never shows a booking's confirmation code, price, voucher or
 * policy number: with the mask up they sit under a cover, while the booking's name stays readable.
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
import { screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { INSURANCE_SCENES } from '../dev/lab-scenes-insurance';
import { WALLET_SCENES } from '../dev/lab-scenes-wallet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function framed(node: ReactNode): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{node}</ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

function scene(scenes: Readonly<Record<string, () => ReactNode>>, name: string): ReactElement {
  const render = scenes[name];
  if (render === undefined) throw new Error(`missing scene ${name}`);
  return framed(render());
}

describe('bookings in a problem report screenshot', () => {
  it('covers the facts of a booking: its confirmation code and price', async () => {
    await renderUi(scene(WALLET_SCENES, 'detail-flight'));
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('bookings-detail-facts'))).toBe(true);
      expect(isCovered(screen.getByText('Confirmation code'))).toBe(true);
      const [title] = screen.getAllByRole('header');
      expect(title === undefined || isCovered(title)).toBe(false);
    });
  });

  it('covers the reference on a wallet card', async () => {
    await renderUi(scene(WALLET_SCENES, 'wallet-stay'));
    await whileMasked(() => {
      expect(isCovered(screen.getByText('REF'))).toBe(true);
    });
  });

  it('covers the boarding pass code and its fields', async () => {
    await renderUi(scene(WALLET_SCENES, 'pass'));
    await whileMasked(() => {
      expect(isCovered(screen.getByText('K7PQ2Z'))).toBe(true);
      expect(screen.getAllByTestId('private-content-cover')).toHaveLength(2);
    });
  });

  it('covers the insurance policy number', async () => {
    await renderUi(scene(INSURANCE_SCENES, 'insurance-card'));
    await whileMasked(() => {
      expect(isCovered(screen.getByText('POLICY NO.'))).toBe(true);
      expect(isCovered(screen.getByText('TRAVEL INSURANCE'))).toBe(false);
    });
  });
});
