/**
 * A problem report's screenshot never shows the holder's pass: with the mask up the whole page
 * (photo, name, number, home and the machine-readable lines) sits under a cover.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { replace: () => undefined, back: () => undefined, push: () => undefined },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { newPassDraft } from '@cp/domain';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { renderUi } from '@/ui/test-support/render';

import { OnboardingPassCard } from '../pass-view';

describe('the pass in a problem report screenshot', () => {
  it('covers the pass page with its name, number and machine-readable lines', async () => {
    await renderUi(
      <OnboardingPassCard
        draft={{
          ...newPassDraft('0192f000-0000-7000-8000-0000000000a1'),
          given_name: 'Winston',
          number: 'CP-0427',
          issued_at: '2026-10-07T03:00:00.000Z',
        }}
      />,
    );
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('onboarding-pass'))).toBe(true);
      expect(isCovered(screen.getByTestId('onboarding-pass-number'))).toBe(true);
      expect(
        isCovered(screen.getByTestId('onboarding-pass-mrz', { includeHiddenElements: true })),
      ).toBe(true);
    });
  });
});
