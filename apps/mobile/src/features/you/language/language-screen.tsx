/**
 * Settings › Language and currency. The language part rides the app's own locale switch:
 * `setLocale` loads the language's words, activates them in place and remembers the choice; the
 * session reports it to the server (`set_app_locale`), so the guide and notifications follow. The
 * currency part writes `price_display` and `home_currency_override` with `set_settings` (queued
 * offline) and shows the change everywhere at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- format values, never copy. */
import type { PriceDisplayMode } from '@cp/domain';
import { getLocales } from 'expo-localization';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { applyMoneyDisplay, useMoneyDisplay } from '@/data/money';
import { useFormats, type DistanceUnit, type TimeFormat } from '@/lib/i18n/formats';
import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';
import { useCommandFeedback } from '@/motion/island-toast';

import { setSettingsCommand } from '../settings/use-synced-settings';
import { currencyLines } from './currency-model';
import { CurrencySection } from './currency-section';
import { CurrencySheet } from './currency-sheet';
import { FormatsSection, FormatsSheet } from './formats-section';
import { featuredLanguages, languageChoices } from './language-names';
import { LanguageView } from './language-view';

const LANGUAGE_TOAST = 'you-language';

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
  const [formatting, setFormatting] = useState(false);
  const formats = useFormats();
  // Until one is chosen the clock follows the language: show which that is.
  const time: TimeFormat =
    formats.time ??
    (new Intl.DateTimeFormat(current, { hour: 'numeric' }).resolvedOptions().hour12 === true
      ? '12h'
      : '24h');
  const display = useMoneyDisplay();
  const { send } = useCommand(setSettingsCommand);
  const { report } = useCommandFeedback();
  const { featured, more } = featuredLanguages(languageChoices(current), deviceLanguages);
  const lines = currencyLines(display, current, now());

  const pick = (code: string) => {
    if (code === current || switching !== null) return;
    setSwitching(code);
    void switchTo(code)
      .catch(() =>
        // The language's words could not be loaded: the app stays as it was, and says why.
        report({ kind: 'unavailable' }, { id: LANGUAGE_TOAST }),
      )
      .finally(() => setSwitching(null));
  };
  const setMode = (mode: PriceDisplayMode) => {
    if (mode === display.mode) return;
    applyMoneyDisplay({ mode });
    void send({ patch: { price_display: mode } }).catch(() => undefined);
  };
  const setTime = (value: TimeFormat) => {
    applyMoneyDisplay({ timeFormat: value });
    void send({ patch: { time_format: value } }).catch(() => undefined);
  };
  const setDistance = (value: DistanceUnit) => {
    applyMoneyDisplay({ distanceUnit: value });
    void send({ patch: { distance_unit: value } }).catch(() => undefined);
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
        <FormatsSection
          time={time}
          distance={formats.distance}
          onOpen={() => setFormatting(true)}
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
      {formatting ? (
        <FormatsSheet
          time={time}
          distance={formats.distance}
          onTime={setTime}
          onDistance={setDistance}
          onClose={() => setFormatting(false)}
        />
      ) : null}
    </>
  );
}
