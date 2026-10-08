// `<Sticker>` rasterises critter art through Skia's JSI host, which Jest cannot run; its own suite
// covers the real pipeline. Here it is a plain view.
jest.mock('@/ui/sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return { Sticker: ({ kind }: { kind: string }) => <RN.View testID={`sticker-${kind}`} /> };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type * as ReactNativeModule from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '../../../../motion/patterns/thud';
import { renderUi } from '../../../../ui/test-support/render';
import { HOME_SCENES } from '../../dev/lab-scenes-home';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function scene(name: string): ReactElement {
  const render = HOME_SCENES[name];
  if (render === undefined) throw new Error(`missing scene ${name}`);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{render()}</ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

describe('Money for a crew of one', () => {
  it('shows what was spent and why nothing splits, instead of an all-square balance', async () => {
    await renderUi(scene('balances-solo'));
    expect(screen.getByTestId('money-hero-solo')).toBeTruthy();
    expect(screen.getByText('SPENT SO FAR')).toBeTruthy();
    expect(screen.getByTestId('money-solo')).toBeTruthy();
    expect(screen.queryByTestId('money-hero-square')).toBeNull();
    expect(screen.queryByTestId('money-bars')).toBeNull();
    expect(screen.queryByTestId('money-settle')).toBeNull();
    expect(screen.getByTestId('money-latest-row')).toBeTruthy();
  });

  it('keeps the balances for a crew with others in it', async () => {
    await renderUi(scene('balances'));
    expect(screen.queryByTestId('money-solo')).toBeNull();
    expect(screen.getByTestId('money-bars')).toBeTruthy();
  });
});
