import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

// The real modules need a native JSI/GPU host Jest cannot provide; these are the native-runtime
// boundary doubles (code-standards.md §17), same class as cp-app-group in app-group.test.tsx. Names
// must start with "mock" — jest hoists the factory above these declarations.
import * as mockSkia from '../__mocks__/mock-skia';
import * as mockReanimated from '../__mocks__/mock-reanimated';

jest.mock('@shopify/react-native-skia', () => mockSkia);
jest.mock('react-native-reanimated', () => mockReanimated);

import CritterSpikeScreen from '../(dev)/spikes/critter';

describe('CritterSpikeScreen', () => {
  it('renders the play control and a native fps readout', async () => {
    const { getByText } = await render(<CritterSpikeScreen />);
    expect(getByText('Play draw-on')).toBeTruthy();
    expect(getByText(/native committed fps/i)).toBeTruthy();
  });
});
