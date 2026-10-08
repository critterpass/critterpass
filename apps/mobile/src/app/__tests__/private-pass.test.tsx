/**
 * A problem report's screenshot never shows the holder's pass: with the mask up the whole page
 * (photo, name, number, home and the machine-readable lines) sits under a cover.
 */

import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { newPassDraft } from '@cp/domain';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { renderUi } from '@/ui/test-support/render';

import { OnboardingPassCard } from '@/features/onboarding/pass-view';

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
