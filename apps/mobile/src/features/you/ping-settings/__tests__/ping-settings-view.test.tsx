/**
 * The budget level in "How much we ping" is set whole at the default budget of 10, in English and
 * Vietnamese: never fitted or cut to one line, and its box never shrunk to its own measured width
 * (Android drew the last word past that box and dropped it).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderWithI18n } from '@/lib/i18n/testing';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { messages as viMessages } from '../../../../../../../packages/i18n/locales/vi/you/pings';
import { DEFAULT_PING_PREFS } from '../ping-prefs';
import { PingSettingsView } from '../ping-settings-view';

const noop = () => undefined;

async function renderLevel(locale: 'en' | 'vi') {
  await renderWithI18n(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <GestureHandlerRootView>
        <ScreenJoltProvider>
          <PingSettingsView
            prefs={DEFAULT_PING_PREFS}
            notificationsOff={false}
            onBudget={noop}
            onRoundupTime={noop}
            onGuideTips={noop}
            onCrewChat={noop}
            onMoney={noop}
            onCrittersNearby={noop}
            onQuietHours={noop}
            onOpenSettings={noop}
          />
        </ScreenJoltProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
    { locale, messages: locale === 'vi' ? viMessages : {} },
  );
  return screen.getByTestId('you-pings-level');
}

describe('the ping budget level', () => {
  const cases: readonly (readonly ['en' | 'vi', string])[] = [
    ['en', 'ABOUT 10 A DAY'],
    ['vi', 'KHOẢNG 10 MỖI NGÀY'],
  ];
  it.each(cases)('is set whole at 10 pings a day (%s)', async (locale, whole) => {
    const level = await renderLevel(locale);
    expect(level).toHaveTextContent(whole);
    expect(level.props.numberOfLines).toBeUndefined();
    expect(level.props.adjustsFontSizeToFit).toBeFalsy();
    const style =
      StyleSheet.flatten(level.props.style as Parameters<typeof StyleSheet.flatten>[0]) ?? {};
    expect(style.flexShrink).toBe(0);
    expect(style.flexGrow).toBe(1);
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
  });
});
