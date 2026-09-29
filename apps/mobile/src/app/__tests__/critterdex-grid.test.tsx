import { fireEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';

// Native-runtime boundary doubles (code-standards.md §17), same class as cp-app-group in
// app-group.test.tsx. Names must start with "mock" — jest hoists the factory above these declarations.
import * as mockSkia from '../__mocks__/mock-skia';
import * as mockReanimated from '../__mocks__/mock-reanimated';
import * as mockList from '../__mocks__/mock-list';

jest.mock('@shopify/react-native-skia', () => mockSkia);
jest.mock('react-native-reanimated', () => mockReanimated);
jest.mock('@shopify/flash-list', () => ({ FlashList: mockList.FlashList }));
jest.mock('@legendapp/list/react-native', () => ({ LegendList: mockList.LegendList }));

// Loaded after the doubles above: these pull in Reanimated at import time.
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import CritterdexGridSpikeScreen from '../(dev)/spikes/critterdex-grid';

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

describe('CritterdexGridSpikeScreen', () => {
  it('renders 600 cells and can switch list implementation and cell mode', async () => {
    const { getByLabelText, getByRole } = await renderScreen(<CritterdexGridSpikeScreen />);

    expect(getByRole('header')).toHaveTextContent('CRITTERDEX GRID SPIKE (600 CELLS)');
    expect(getByLabelText('list: flash-list')).toBeTruthy();

    await fireEvent.press(getByLabelText('list: flash-list'));
    expect(getByLabelText('list: legend-list')).toBeTruthy();

    await fireEvent.press(getByLabelText('cells: cached image'));
    expect(getByLabelText('cells: live redraw')).toBeTruthy();
  });
});
