/**
 * Every critters lab scene renders to its screen's root without throwing, so a scene that would
 * show the error boundary on a device fails here first.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
// The map is a native view: the where-to-find scenes render their pins without it.
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    Map: ({ children }: { children: unknown }) => <View testID="maplibre-map">{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children: unknown }) => <View>{children}</View>,
    Marker: ({ children }: { children: unknown }) => <View>{children}</View>,
    GeoJSONSource: ({ children }: { children: unknown }) => <View>{children}</View>,
    Layer: () => null,
  };
});
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/critters-scene',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { CRITTER_SCENES, CRITTER_SCENE_NAMES } from '../lab-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('critters lab scenes', () => {
  it.each(CRITTER_SCENE_NAMES)('%s renders', async (name) => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const scene = CRITTER_SCENES[name];
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
