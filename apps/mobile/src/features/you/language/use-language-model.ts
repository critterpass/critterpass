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
import {
  effectiveTimeFormat,
  useFormats,
  type DistanceUnit,
  type TimeFormat,
} from '@/lib/i18n/formats';
import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';
import { useCommandFeedback } from '@/motion/island-toast';

import { setSettingsCommand } from '../settings/use-synced-settings';
import { currencyLines } from './currency-model';

import { featuredLanguages, languageChoices } from './language-names';

const LANGUAGE_TOAST = 'you-language';

export interface LanguageScreenProps {
  readonly switchTo?: (code: string) => Promise<void>;
  readonly deviceLanguages?: readonly string[];
  readonly now?: () => Date;
}

/**
 * The page's state and what each choice does: the languages (featured and the rest), the money
 * display and the formats, each change applied at once and queued to the server. The premium page
 * draws it.
 */
export function useLanguageModel({
  switchTo = (code: string) => setLocale(code),
  deviceLanguages = getLocales().map((locale) => locale.languageTag),
  now = () => new Date(),
}: LanguageScreenProps = {}) {
  const current = useLocale();
  const [switching, setSwitching] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [picking, setPicking] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const formats = useFormats();
  // Until one is chosen the app writes 24-hour times: show that one as chosen.
  const time: TimeFormat = effectiveTimeFormat(formats);
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

  return {
    current,
    switching,
    showMore,
    setShowMore,
    picking,
    setPicking,
    formatting,
    setFormatting,
    formats,
    time,
    display,
    featured,
    more,
    lines,
    pick,
    setMode,
    setTime,
    setDistance,
    setHome,
  };
}
