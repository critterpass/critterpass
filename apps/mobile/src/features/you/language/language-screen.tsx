/**
 * Settings › Language and currency. The language part rides the app's own locale switch:
 * `setLocale` loads the language's words, activates them in place and remembers the choice; the
 * session reports it to the server (`set_app_locale`), so the guide and notifications follow. The
 * currency part writes `price_display` and `home_currency_override` with `set_settings` (queued
 * offline) and shows the change everywhere at once.
 */
import type { PriceDisplayMode } from '@cp/domain';
import { getLocales } from 'expo-localization';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { applyMoneyDisplay, useMoneyDisplay } from '@/data/money';
import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';

import { setSettingsCommand } from '../settings/use-synced-settings';
import { currencyLines } from './currency-model';
import { CurrencySection } from './currency-section';
import { CurrencySheet } from './currency-sheet';
import { featuredLanguages, languageChoices } from './language-names';
import { LanguageView } from './language-view';

export function LanguageScreen({
  switchTo = (code: string) => setLocale(code),
  deviceLanguages = getLocales().map((locale) => locale.languageTag),
  now = () => new Date(),
}: {
  readonly switchTo?: (code: string) => Promise<void>;
  readonly deviceLanguages?: readonly string[];
  readonly now?: () => Date;
}) {
  const current = useLocale();
  const [switching, setSwitching] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [picking, setPicking] = useState(false);
  const display = useMoneyDisplay();
  const { send } = useCommand(setSettingsCommand);
  const { featured, more } = featuredLanguages(languageChoices(current), deviceLanguages);
  const lines = currencyLines(display, current, now());

  const pick = (code: string) => {
    if (code === current || switching !== null) return;
    setSwitching(code);
    void switchTo(code)
      .catch(() => undefined)
      .finally(() => setSwitching(null));
  };
  const setMode = (mode: PriceDisplayMode) => {
    if (mode === display.mode) return;
    applyMoneyDisplay({ mode });
    void send({ patch: { price_display: mode } }).catch(() => undefined);
  };
  const setHome = (code: string | null) => {
    setPicking(false);
    applyMoneyDisplay({ homeCurrency: code });
    void send({ patch: { home_currency_override: code } }).catch(() => undefined);
  };

  return (
    <>
      <LanguageView
        featured={featured}
        more={more}
        showMore={showMore}
        onShowMore={() => setShowMore(true)}
        current={current}
        switching={switching}
        onPick={pick}
      >
        <CurrencySection
          homeLine={lines.homeLine}
          homeSymbol={lines.homeSymbol}
          onHomeCurrency={() => setPicking(true)}
          mode={display.mode}
          onMode={setMode}
          sample={lines.sample}
          ratesLine={lines.ratesLine}
        />
      </LanguageView>
      {picking ? (
        <CurrencySheet
          airportCurrency={display.airportCurrency}
          chosen={display.homeFromAirport ? null : display.homeCurrency}
          onPick={setHome}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}
