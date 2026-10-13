/**
 * A problem report's screenshot never shows a booking's confirmation code, price or policy number:
 * with the mask up they sit under a cover, while the labels and the card's name stay readable.
 */
// The bookings screens reach the device database opener and the billing module, which Jest cannot
// load; these pieces draw from their props.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeyValueCard } from '@/features/bookings/premium/components/KeyValueCard';
import { PolicyCard } from '@/features/bookings/premium/InsurancePremium';
import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

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

describe('bookings in a problem report screenshot', () => {
  it('covers the private facts of a booking: its confirmation code and price', async () => {
    await renderUi(
      framed(
        <KeyValueCard
          testID="bookings-detail-facts"
          rows={[
            { key: 'where', label: 'Where', value: 'Ubud' },
            { key: 'ref', label: 'Confirmation code', value: 'K7PQ2Z', mono: true, private: true },
            { key: 'price', label: 'Price', value: 'US$420', private: true },
          ]}
        />,
      ),
    );
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByText('K7PQ2Z'))).toBe(true);
      expect(isCovered(screen.getByText('US$420'))).toBe(true);
      expect(isCovered(screen.getByText('Ubud'))).toBe(false);
      expect(isCovered(screen.getByText('Confirmation code'))).toBe(false);
    });
  });

  it('covers the insurance policy number', async () => {
    await renderUi(
      framed(<PolicyCard provider="SafetyWing" policyNo="SW-2210-88" onPress={() => undefined} />),
    );
    await whileMasked(() => {
      expect(isCovered(screen.getByText('SW-2210-88'))).toBe(true);
      expect(isCovered(screen.getByText('TRAVEL INSURANCE'))).toBe(false);
    });
  });
});
