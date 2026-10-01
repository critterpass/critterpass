import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { keyboardForTests } from '@/motion/test-support/reanimated-mock';
import { tokens } from '@cp/design-tokens';

import { FOOTER_FADE_PT, KeyboardFooter } from '../layout/KeyboardFooter';
import { KeyboardScrollView } from '../layout/KeyboardScrollView';
import { Scaffold } from '../surface/Scaffold';
import { renderUi } from '../test-support/render';

const HOME_INDICATOR = 34;
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: HOME_INDICATOR },
};

function flat(testID: string): ViewStyle {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style as StyleProp<ViewStyle>) ?? {};
}

async function renderFooter(variant: 'dark' | 'paper' = 'dark') {
  await renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <Scaffold variant={variant}>
          <KeyboardFooter testID="footer">
            <Text>Next</Text>
          </KeyboardFooter>
        </Scaffold>
      </ScreenJoltProvider>
    </SafeAreaProvider>,
  );
}

/** Reanimated's keyboard states a footer can be told. */
const UNREPORTED = 0;
const CLOSED = 4;

/** The keyboard React Native saw open before the footer mounted. */
function keyboardAlreadyOpen(height: number) {
  jest
    .spyOn(Keyboard, 'metrics')
    .mockReturnValue({ screenX: 0, screenY: METRICS.frame.height - height, width: 390, height });
}

afterEach(() => {
  keyboardForTests.height.value = 0;
  keyboardForTests.state.value = UNREPORTED;
  jest.restoreAllMocks();
});

describe('KeyboardFooter', () => {
  it('sits above the home indicator on the screen background while the keyboard is down', async () => {
    await renderFooter('paper');
    expect(flat('footer')).toMatchObject({
      paddingBottom: HOME_INDICATOR + tokens.space['8'],
      backgroundColor: tokens.color.paper.base,
    });
    expect(flat('footer-edge').opacity).toBe(0);
  });

  it('rides on top of the keyboard with its top edge drawn while the keyboard is up', async () => {
    keyboardForTests.height.value = 336;
    await renderFooter();
    expect(flat('footer').paddingBottom).toBe(336 + tokens.space['8']);
    expect(flat('footer-edge')).toMatchObject({ opacity: 1, height: StyleSheet.hairlineWidth });
  });
});

describe('a footer that mounts while the keyboard is already up', () => {
  it('starts on top of the keyboard before the keyboard moves again', async () => {
    keyboardAlreadyOpen(336);
    await renderFooter();
    expect(flat('footer').paddingBottom).toBe(336 + tokens.space['8']);
    expect(flat('footer-edge').opacity).toBe(1);
  });

  it('adds the navigation bar on Android, where the keyboard is measured from above it', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    keyboardAlreadyOpen(300);
    await renderFooter();
    expect(flat('footer').paddingBottom).toBe(300 + HOME_INDICATOR + tokens.space['8']);
  });

  it('follows the keyboard once it has moved, not where it stood at mount', async () => {
    keyboardAlreadyOpen(336);
    keyboardForTests.state.value = CLOSED;
    await renderFooter();
    expect(flat('footer').paddingBottom).toBe(HOME_INDICATOR + tokens.space['8']);
    expect(flat('footer-edge').opacity).toBe(0);
  });
});

describe('scrolling under the footer', () => {
  it("fades the content into the page over the footer's top edge, without taking space", async () => {
    await renderFooter();
    // Pulled up over the content's end by its own height: it takes no space in the layout.
    expect(flat('footer-fade')).toMatchObject({
      height: FOOTER_FADE_PT,
      marginTop: -FOOTER_FADE_PT,
    });
  });

  it("ends the scroll content past the fade, on top of the content's own padding", async () => {
    await renderUi(
      <KeyboardScrollView contentContainerStyle={{ padding: 20 }} testID="body">
        <Text testID="last">Last item</Text>
      </KeyboardScrollView>,
    );
    const content = screen.getByTestId('last').parent;
    const style = StyleSheet.flatten(content?.props.style as StyleProp<ViewStyle>) ?? {};
    expect(style.paddingBottom).toBe(20 + FOOTER_FADE_PT);
  });
});
