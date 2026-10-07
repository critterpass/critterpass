/**
 * Renders a guide screen the way the app root does: the Lingui provider, safe-area metrics of a
 * phone with a notch, gesture root and the screen jolt, over a local-first stack when given one.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export async function renderScreen(
  ui: ReactElement,
  stack?: TestLocalFirst,
): Promise<RenderResult> {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const wrap = (node: ReactElement) => {
    const body = <ScreenJoltProvider>{node}</ScreenJoltProvider>;
    return (
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            {stack === undefined ? (
              body
            ) : (
              <LocalFirstProvider value={stack.value}>{body}</LocalFirstProvider>
            )}
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>
    );
  };
  const result = await render(wrap(ui));
  // `rerender` keeps the same wrappers.
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}
