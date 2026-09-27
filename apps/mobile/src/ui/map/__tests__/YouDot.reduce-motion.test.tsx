import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { YouDot } from '../YouDot';

// A dedicated file (not a runtime toggle) because the Reanimated override is a module-scoped
// `jest.mock`, hoisted before imports. `requireActual` resolves to the shared Jest stand-in that
// jest.config.js maps Reanimated to, with only `useReducedMotion` changed.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  useReducedMotion: () => true,
}));

describe('YouDot with Reduce Motion enabled', () => {
  it('still renders with its label — the ping animation is dropped, not the dot itself', async () => {
    await renderWithI18n(<YouDot />);
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    expect(screen.getByTestId('you-dot')).toBeTruthy();
  });
});
