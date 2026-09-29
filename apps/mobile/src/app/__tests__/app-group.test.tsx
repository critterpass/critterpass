import { fireEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

// The real module resolves to a native binding that only exists on-device/simulator; Jest runs on
// Node, so the native boundary is the test double here (code-standards.md §17), not the screen's
// own logic. Names must start with "mock" — jest hoists the factory above these declarations.
const mockWriteSnapshot = jest.fn();
const mockReloadWidgets = jest.fn();
const mockReadOutboxActions = jest.fn(() => []);

jest.mock('../../../modules/cp-app-group', () => ({
  writeSnapshot: (...args: unknown[]) => mockWriteSnapshot(...args),
  reloadWidgets: (...args: unknown[]) => mockReloadWidgets(...args),
  readOutboxActions: () => mockReadOutboxActions(),
}));

import AppGroupSpikeScreen from '../(dev)/spikes/app-group';

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

describe('AppGroupSpikeScreen', () => {
  it('writes a schema-versioned hello snapshot and reports the round-trip time', async () => {
    const { findByText, getByLabelText } = await renderScreen(<AppGroupSpikeScreen />);

    await fireEvent.press(getByLabelText('Write hello snapshot'));

    expect(mockWriteSnapshot).toHaveBeenCalledTimes(1);
    const [key, json] = mockWriteSnapshot.mock.calls[0] as [string, string];
    expect(key).toBe('hello');
    const envelope = JSON.parse(json) as { schema: number; generated_at: string; message: string };
    expect(envelope.schema).toBe(1);
    expect(envelope.message).toContain('hello from JS');

    expect(await findByText(/ms$/)).toBeTruthy();
  });

  it('reloads widgets on demand', async () => {
    const { getByLabelText } = await renderScreen(<AppGroupSpikeScreen />);
    await fireEvent.press(getByLabelText('Reload widgets'));
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);
  });

  it('surfaces a native error instead of crashing the screen', async () => {
    mockWriteSnapshot.mockImplementationOnce(() => {
      throw new Error('App Group container is unavailable');
    });
    const { findByText, getByLabelText } = await renderScreen(<AppGroupSpikeScreen />);

    await fireEvent.press(getByLabelText('Write hello snapshot'));

    expect(await findByText('App Group container is unavailable')).toBeTruthy();
  });
});
