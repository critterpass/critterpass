/**
 * Picking a language switches the app in place: the same screen redraws in the new language with
 * no navigation, and picking the language already showing does nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/you/language',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { shippedLocales } from '@cp/i18n';
import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setLocale } from '@/lib/i18n/set-locale';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { languageChoices, localLanguageName } from '../language-names';
import { LanguageScreen } from '../language-screen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('language', () => {
  it('lists every shipped language once, the current one first, never the pseudo locale', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const codes = languageChoices('vi').map((choice) => choice.code);
    expect(codes[0]).toBe('vi');
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('en');
    expect(codes).not.toContain('en-XA');
  });

  it('has a translatable name for every shipped language, not the registry fallback', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    for (const entry of shippedLocales.filter((locale) => locale.pseudo !== true)) {
      expect(localLanguageName(entry.code, 'FALLBACK')).not.toBe('FALLBACK');
    }
  });

  it('redraws in the picked language in place, with no navigation', async () => {
    await setLocale('en', { persist: false });
    const switchTo = jest.fn((code: string) => setLocale(code, { persist: false }));
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <ScreenJoltProvider>
              <LanguageScreen switchTo={switchTo} />
            </ScreenJoltProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    expect(screen.getByText('LANGUAGE')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-language-en'));
    expect(switchTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('you-language-vi'));
    await waitFor(() => expect(screen.getByText('NGÔN NGỮ')).toBeTruthy());
    expect(switchTo).toHaveBeenCalledWith('vi');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await setLocale('en', { persist: false });
  });
});
