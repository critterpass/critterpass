import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { YouDot } from '../YouDot';

// A dedicated file (not a runtime toggle) because Reanimated's mock is applied via a
// module-scoped `jest.mock`, hoisted before imports — swapping `useReducedMotion` per-test in one
// file would require an unmock/remock dance that is far less clear than one small file per mode.
// See DoodlePin.test.tsx for why this is a real `require()`, not an import.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const mock = require('react-native-reanimated/lib/module/mock.js');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { ...mock, useReducedMotion: () => true };
});

describe('YouDot with Reduce Motion enabled', () => {
  it('still renders with its label — the ping animation is dropped, not the dot itself', async () => {
    await renderWithI18n(<YouDot />);
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    expect(screen.getByTestId('you-dot')).toBeTruthy();
  });
});
