import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { ReactElement } from 'react';

// The real modules need a native JSI/GPU host Jest cannot provide; these are the native-runtime
// boundary doubles (code-standards.md §17), same class as cp-app-group in app-group.test.tsx. Names
// must start with "mock" — jest hoists the factory above these declarations.
import * as mockSkia from '../__mocks__/mock-skia';
import * as mockReanimated from '../__mocks__/mock-reanimated';

jest.mock('@shopify/react-native-skia', () => mockSkia);
jest.mock('react-native-reanimated', () => mockReanimated);

// Loaded after the doubles above: these pull in Reanimated at import time.
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import CritterSpikeScreen from '../(dev)/spikes/critter';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Renders a (dev) screen under the providers the app root mounts above every route, minus the
 * gesture root: the Reanimated double above is too small for react-native-gesture-handler.
 */
function renderScreen(ui: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScreenJoltProvider>{ui}</ScreenJoltProvider>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('CritterSpikeScreen', () => {
  it('renders the play control and a native fps readout', async () => {
    const { getByText } = await renderScreen(<CritterSpikeScreen />);
    expect(getByText('Play draw-on')).toBeTruthy();
    expect(getByText(/native committed fps/i)).toBeTruthy();
  });
});
