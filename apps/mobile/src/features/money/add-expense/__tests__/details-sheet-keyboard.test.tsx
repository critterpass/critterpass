/**
 * "What was it?" with the keyboard up: the sheet lifts its foot by the keyboard's height, so DONE has
 * to sit at that foot, outside the scrolling fields. Laid out after the fields instead, it ran on
 * under the keyboard on an iPhone and only a sliver of it showed while the name was typed.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../../../ui/test-support/skia-double'));

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Slot } from 'expo-router';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/lib/theme';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { DetailsSheet } from '../DetailsSheet';

// Imported last: the testing library registers its own Reanimated mock (see jest.config.js).
import { act, renderRouter, screen, within } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
const KEYBOARD = 335;

function Root() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <GestureHandlerRootView>
            <ScreenJoltProvider>
              <Slot />
            </ScreenJoltProvider>
          </GestureHandlerRootView>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Details() {
  return (
    <DetailsSheet
      description="Lunch"
      category="food"
      daysBack={0}
      onDescription={jest.fn()}
      onCategory={jest.fn()}
      onDay={jest.fn()}
      onClose={jest.fn()}
    />
  );
}

interface Rendered {
  readonly parent: Rendered | null;
  readonly props: { readonly style?: Parameters<typeof StyleSheet.flatten>[0] };
}

/** The nearest view above `node` padded at its foot, which is where the sheet clears the keyboard. */
function footPadding(node: Rendered): number | undefined {
  for (let at = node.parent; at !== null; at = at.parent) {
    const style = StyleSheet.flatten(at.props.style);
    if (typeof style?.paddingBottom === 'number' && style.paddingBottom > 0) {
      return style.paddingBottom;
    }
  }
  return undefined;
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('expense details sheet', () => {
  it('keeps DONE at the foot the keyboard lifts, outside the scrolling fields', async () => {
    await renderRouter({ _layout: Root, index: Details }, { initialUrl: '/' });
    await act(async () => {});
    // The keyboard comes up (an async act, so the sheet's state update is flushed).
    await act(() =>
      Promise.resolve(
        DeviceEventEmitter.emit('keyboardWillShow', {
          endCoordinates: { height: KEYBOARD, screenX: 0, screenY: 874 - KEYBOARD, width: 402 },
        }),
      ),
    );

    const fields = screen.getByTestId('money-add-details-scroll');
    expect(within(fields).getByTestId('money-add-name')).toBeTruthy();
    expect(within(fields).queryByTestId('money-add-details-done')).toBeNull();
    expect(footPadding(screen.getByTestId('money-add-details-done') as unknown as Rendered)).toBe(
      KEYBOARD,
    );
  });
});
