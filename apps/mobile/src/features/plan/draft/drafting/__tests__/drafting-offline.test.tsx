/**
 * The drafting wait with no signal: nothing has started, and the wait can still be left.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { DraftingFooter } from '../drafting-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('drafting with no signal', () => {
  it('offers a way to leave, and nothing to stop: no draft is running', async () => {
    const onBack = jest.fn();
    const onCancel = jest.fn();
    await renderUi(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScreenJoltProvider>
          <DraftingFooter
            phase={{ kind: 'offline' }}
            onRetry={() => undefined}
            onCancel={onCancel}
            onBack={onBack}
          />
        </ScreenJoltProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('drafting-cancel')).toBeNull();
    await fireEvent.press(screen.getByTestId('drafting-leave'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
