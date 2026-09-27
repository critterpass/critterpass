import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

// Native-runtime boundary doubles (code-standards.md §17), same class as cp-app-group in
// app-group.test.tsx. Names must start with "mock" — jest hoists the factory above these declarations.
import * as mockSkia from '../__mocks__/mock-skia';
import * as mockReanimated from '../__mocks__/mock-reanimated';
import * as mockList from '../__mocks__/mock-list';

jest.mock('@shopify/react-native-skia', () => mockSkia);
jest.mock('react-native-reanimated', () => mockReanimated);
jest.mock('@shopify/flash-list', () => ({ FlashList: mockList.FlashList }));
jest.mock('@legendapp/list/react-native', () => ({ LegendList: mockList.LegendList }));

import CritterdexGridSpikeScreen from '../(dev)/spikes/critterdex-grid';

// Renders 600 real components (the mocked list has no virtualization); give this more headroom
// than Jest's 5 s default on a loaded machine.
const RENDER_TIMEOUT_MS = 15_000;

describe('CritterdexGridSpikeScreen', () => {
  it(
    'renders 600 cells and can switch list implementation and cell mode',
    async () => {
      const { getByText } = await render(<CritterdexGridSpikeScreen />);

      expect(getByText('Critterdex grid spike (600 cells)')).toBeTruthy();
      expect(getByText('list: flash-list')).toBeTruthy();

      await fireEvent.press(getByText('list: flash-list'));
      expect(getByText('list: legend-list')).toBeTruthy();

      await fireEvent.press(getByText('cells: cached image'));
      expect(getByText('cells: live redraw')).toBeTruthy();
    },
    RENDER_TIMEOUT_MS,
  );
});
