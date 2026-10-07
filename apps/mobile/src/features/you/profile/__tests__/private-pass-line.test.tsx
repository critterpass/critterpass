/**
 * A problem report's screenshot never shows the machine-readable line of the member's pass on
 * their profile: with the mask up it sits under a cover, the rest of the profile does not.
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
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { YOU_SCENES } from '../../dev/lab-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('the profile in a problem report screenshot', () => {
  it('covers the pass line and nothing else', async () => {
    await renderUi(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScreenJoltProvider>{YOU_SCENES['3n-1-profile']?.()}</ScreenJoltProvider>
      </SafeAreaProvider>,
    );
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('you-profile-mrz'))).toBe(true);
      expect(screen.getAllByTestId('private-content-cover')).toHaveLength(1);
    });
  });
});
