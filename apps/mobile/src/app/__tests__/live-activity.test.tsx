import { fireEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

const mockWriteSnapshot = jest.fn();
const mockReloadWidgets = jest.fn();

jest.mock('../../../modules/cp-app-group', () => ({
  writeSnapshot: (...args: unknown[]) => mockWriteSnapshot(...args),
  reloadWidgets: (...args: unknown[]) => mockReloadWidgets(...args),
}));

import LiveActivitySpikeScreen from '../(dev)/spikes/live-activity';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Renders a (dev) screen under the providers the app root mounts above every route. */
function renderScreen(ui: ReactElement) {
  return renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{ui}</ScreenJoltProvider>
    </SafeAreaProvider>,
  );
}

describe('LiveActivitySpikeScreen', () => {
  it('seeds a LeaveBy content-state snapshot the widget target can read', async () => {
    const { getByText, findByText } = await renderScreen(<LiveActivitySpikeScreen />);

    await fireEvent.press(getByText('Seed leave-by preview snapshot'));

    expect(mockWriteSnapshot).toHaveBeenCalledTimes(1);
    const [key, json] = mockWriteSnapshot.mock.calls[0] as [string, string];
    expect(key).toBe('la-leave-by-preview');
    const envelope = JSON.parse(json) as { schema: number; content_state: { state: string } };
    expect(envelope.schema).toBe(1);
    expect(envelope.content_state.state).toBe('soon');
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);

    expect(await findByText(/Seeded la-leave-by-preview/)).toBeTruthy();
  });
});
