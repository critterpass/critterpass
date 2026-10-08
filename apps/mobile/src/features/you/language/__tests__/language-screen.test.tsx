/**
 * Picking a language switches the app in place: the same screen redraws in the new language with
 * no navigation, and picking the language already showing does nothing.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/you/language',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { shippedLocales } from '@cp/i18n';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clearMoneyDisplayOverride } from '@/data/money/use-money-display';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { setLocale } from '@/lib/i18n/set-locale';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { featuredLanguages, languageChoices, localLanguageName } from '../language-names';
import { LanguageScreen } from '../language-screen';

configure({ asyncUtilTimeout: 5000 });

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  clearMoneyDisplayOverride();
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

/** A signed-in phone whose home airport is in Singapore, with the newest rates synced. */
async function openStack(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const x = (sql: string, params: unknown[] = []) => stack.db.execute(sql, params);
  await x('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  await x("INSERT INTO users (id, display_name, home_country) VALUES (?, 'Khanh', 'SG')", [
    stack.uid,
  ]);
  await x(
    `INSERT INTO fx_snapshots (id, base, quote, rate, as_of, source) VALUES
       ('fx1', 'USD', 'IDR', '16000', '2026-10-02', 'ecb'),
       ('fx2', 'USD', 'SGD', '1.3653', '2026-10-02', 'ecb')`,
  );
  return stack;
}

async function queuedPatches(stack: TestLocalFirst): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    "SELECT envelope FROM commands WHERE cmd = 'set_settings' ORDER BY seq",
  );
  return rows.map(
    (row) => (JSON.parse(row.envelope) as { payload: { patch: unknown } }).payload.patch,
  );
}

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

  it("shows the current language, the phone's own and English first, and the rest under more", () => {
    const choices = languageChoices('ja');
    const { featured, more } = featuredLanguages(choices, ['vi-VN', 'ja-JP']);
    expect(featured.map((choice) => choice.code)).toEqual(['ja', 'vi', 'en', featured[3]?.code]);
    expect(featured).toHaveLength(4);
    expect([...featured, ...more].map((c) => c.code).sort()).toEqual(
      choices.map((c) => c.code).sort(),
    );
  });

  it('redraws in the picked language in place, with no navigation', async () => {
    await setLocale('en', { persist: false });
    const switchTo = jest.fn((code: string) => setLocale(code, { persist: false }));
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <ScreenJoltProvider>
              <LocalFirstProvider value={(await openStack()).value}>
                <LanguageScreen switchTo={switchTo} deviceLanguages={['en-SG']} />
              </LocalFirstProvider>
            </ScreenJoltProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    expect(screen.getByText('LANGUAGE AND CURRENCY')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-language-en'));
    expect(switchTo).not.toHaveBeenCalled();
    // Vietnamese is not among the four shown first on an English phone: "N more" opens the rest.
    expect(screen.queryByTestId('you-language-vi')).toBeNull();
    await fireEvent.press(screen.getByTestId('you-language-more'));
    await fireEvent.press(screen.getByTestId('you-language-vi'));
    await waitFor(() =>
      expect(screen.getByTestId('you-language-title').props.children).not.toBe(
        'Language and currency',
      ),
    );
    expect(switchTo).toHaveBeenCalledWith('vi');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await setLocale('en', { persist: false });
  });

  it('shows prices in the chosen mode at once, with the home currency from the home airport', async () => {
    await setLocale('en', { persist: false });
    const stack = await openStack();
    await render(
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <GestureHandlerRootView>
            <ScreenJoltProvider>
              <LocalFirstProvider value={stack.value}>
                <LanguageScreen
                  deviceLanguages={['en-SG']}
                  now={() => new Date('2026-10-03T09:00:00Z')}
                />
              </LocalFirstProvider>
            </ScreenJoltProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText('SGD · from your home airport')).toBeTruthy());
    expect(screen.getByText(/^Rp.75,000$/u)).toBeTruthy();
    await fireEvent.press(screen.getByText('BOTH'));
    await waitFor(() => expect(screen.getByText(/^Rp.75,000 ≈ S\$\s?6\.40$/u)).toBeTruthy());
    await waitFor(async () =>
      expect(await queuedPatches(stack)).toEqual([{ price_display: 'both' }]),
    );
  });
});
