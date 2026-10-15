/**
 * The drafting wait with no signal: nothing has started, and the wait can still be left.
 */
// The app's own database module loads the native driver; these tests run on the test stack.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('expo-router', () => ({
  // The premium pages declare their native header through the stack's screen.
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '@/lib/test-support/render-ui';

import { PremiumDraftingView } from '../../../premium/draft/drafting-view';

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
        <PremiumDraftingView
          guide="tokek"
          days={3}
          phase={{ kind: 'offline' }}
          steps={[]}
          dayCards={[]}
          leaving={false}
          onDone={() => undefined}
          onRetry={() => undefined}
          onCancel={onCancel}
          onBack={onBack}
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('Cancel the draft')).toBeNull();
    await fireEvent.press(screen.getByTestId('drafting-leave'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
