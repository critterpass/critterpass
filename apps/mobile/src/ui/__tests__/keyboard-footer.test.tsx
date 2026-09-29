import { afterEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
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

afterEach(() => {
  keyboardForTests.height.value = 0;
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

describe('scrolling under the footer', () => {
  it("fades the content into the page over the footer's top edge, without taking space", async () => {
    await renderFooter();
    expect(flat('footer-fade')).toMatchObject({
      position: 'absolute',
      bottom: '100%',
      height: FOOTER_FADE_PT,
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
