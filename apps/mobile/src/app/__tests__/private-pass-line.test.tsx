/**
 * A problem report's screenshot never shows the machine-readable line of the member's pass: with
 * the mask up it sits under a cover, the rest of the passport page does not.
 */

jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import type { ProfileModel } from '@/features/you/profile/profile-model';
import { PassportCard } from '@/features/you/premium/profile/passport-card';
import { renderUi } from '@/lib/test-support/render-ui';

const MODEL: ProfileModel = {
  name: 'Khánh',
  username: null,
  homeCity: 'Hồ Chí Minh City',
  avatar: { kind: 'initials' },
  ring: null,
  passPlus: false,
  stats: { trips: 0, countries: 1, critters: 0 },
  stamps: [],
  stampTotal: 0,
  tags: [],
  crews: [],
  mrz: 'P<VNMKHANH<<CP0012',
  sinceYear: 2026,
};

describe('the pass in a problem report screenshot', () => {
  it('covers the machine line and nothing else', async () => {
    await renderUi(<PassportCard model={MODEL} photoUri={null} />);
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('you-profile-mrz'))).toBe(true);
      expect(screen.getAllByTestId('private-content-cover')).toHaveLength(1);
    });
  });
});
