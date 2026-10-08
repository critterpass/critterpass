/**
 * A problem report's screenshot never shows the machine-readable line of the member's pass on
 * their profile: with the mask up it sits under a cover, the rest of the profile does not.
 */

import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { YOU_SCENES } from '@/features/you/dev/lab-scenes';

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
