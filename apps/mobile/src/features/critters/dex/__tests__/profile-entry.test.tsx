/**
 * The PASS tab's way to the profile: the person's own face at the end of the title line opens it,
 * with a full-size touch target, and the header is unchanged when there is no profile to open.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/pass',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { MIN_TOUCH_TARGET } from '@/ui/theme';

import { labDexInput } from '../../dev/dex-fixtures';
import { buildDex } from '../dex-model';
import { DexView, type DexProfileEntry } from '../dex-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const noop = () => undefined;

async function show(profile?: DexProfileEntry) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const view: ReactNode = (
    <DexView
      state="ready"
      model={buildDex(labDexInput({}))}
      near={new Set<string>()}
      filter="all"
      onFilter={noop}
      query=""
      onQuery={noop}
      egg={null}
      onHatch={noop}
      onOpenHatch={noop}
      exploreAtHome={null}
      onExploreAtHome={noop}
      onOpenSet={noop}
      onOpenCritter={noop}
      onOpenLegendaries={noop}
      profile={profile}
    />
  );
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{view}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('the PASS tab’s profile entry', () => {
  it('opens the profile from the person’s own face, with a 44 pt target', async () => {
    const onOpen = jest.fn();
    await show({ name: 'Khánh', guide: null, onOpen });
    const entry = screen.getByTestId('critters-dex-profile');
    expect(entry.props.accessibilityLabel).toBe('Your profile');
    const slop = entry.props.hitSlop as { top: number; left: number };
    expect(32 + slop.top * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(32 + slop.left * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(entry);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is not drawn when there is no profile to open', async () => {
    await show(undefined);
    expect(screen.getByTestId('critters-dex-header')).toBeTruthy();
    expect(screen.queryByTestId('critters-dex-profile')).toBeNull();
  });
});
