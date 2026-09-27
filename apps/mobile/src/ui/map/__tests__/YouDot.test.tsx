import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { YouDot } from '../YouDot';

// See DoodlePin.test.tsx for why this is a real `require()`, not an import.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require('react-native-reanimated/lib/module/mock.js');
});

describe('YouDot', () => {
  it('always carries a "Your location" label — colour is never the only signal', async () => {
    await renderWithI18n(<YouDot />);
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    expect(screen.getByTestId('you-dot')).toBeTruthy();
  });
});
