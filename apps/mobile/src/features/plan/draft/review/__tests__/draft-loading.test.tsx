/**
 * The private draft while it loads: its back shows from the first frame (named for the trip once
 * the trip row is on the phone), and a slow load brings in the trip guide's line.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { SLOW_LOADING_MS } from '@/ui/states/Skeleton';
import { renderUi } from '@/ui/test-support/render';

import { DraftLoading } from '../draft-loading';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function render(ui: ReactElement) {
  return renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{ui}</ScreenJoltProvider>
    </SafeAreaProvider>,
  );
}

describe('draft loading', () => {
  it('shows the way back before the trip row arrives', async () => {
    const onBack = jest.fn();
    await render(<DraftLoading trip={null} onBack={onBack} />);
    expect(screen.getByText(/back/i)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('draft-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('names the setup and brings in the guide on a slow load', async () => {
    jest.useFakeTimers();
    try {
      await render(
        <DraftLoading trip={{ destination: 'Kyoto', guide: 'pon' }} onBack={() => undefined} />,
      );
      expect(screen.getByText(/kyoto setup/i)).toBeTruthy();
      expect(screen.queryByText(/laying out your days/)).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(SLOW_LOADING_MS + 1);
        await Promise.resolve();
      });
      expect(screen.getByText('Pon is laying out your days…')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
