/**
 * Every profile lab scene renders to its screen's root without throwing, so a scene that would
 * show the error boundary on a device fails here first.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/you-scene',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { YOU_SCENE_NAMES, YOU_SCENES } from '../lab-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('profile lab scenes', () => {
  it.each(YOU_SCENE_NAMES)('%s renders', async (name) => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const scene = YOU_SCENES[name];
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <ScreenJoltProvider>{scene?.()}</ScreenJoltProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    expect(screen.toJSON()).not.toBeNull();
  });
});
