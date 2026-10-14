/**
 * Dates and clocks the way the app writes them, whoever builds the formatter: every
 * `Intl.DateTimeFormat` in the app (the shared `format.date`, a screen's own formatter, Lingui's
 * dates) goes through this one, installed once at launch.
 *
 * - English writes the day before the month ("Mon 12 Oct", "26 Sep 2026"), as the design does,
 *   not the US order ("Oct 12") the bare `en` tag gives.
 * - A time with no 12/24-hour choice of its own takes the one from Settings, 24-hour by default
 *   (`clockOption`), so a formatter that forgot to ask never writes "3:08 PM".
 */
import { clockOption, currentFormats } from './formats';

/** The tag a language's dates are written in, where it isn't the language's own. */
const DATE_LOCALES: Readonly<Record<string, string>> = { en: 'en-GB' };

type Locales = string | readonly string[] | undefined;

/** The locale tags a date formatter is built with. */
export function appDateLocales(locales: Locales): Locales {
  if (typeof locales === 'string') return DATE_LOCALES[locales] ?? locales;
  if (locales === undefined) return undefined;
  return locales.map((tag) => DATE_LOCALES[tag] ?? tag);
}

/** The options with the app's clock added when they show a time and don't choose one. */
export function withAppClock(
  options: Intl.DateTimeFormatOptions | undefined,
): Intl.DateTimeFormatOptions | undefined {
  if (options === undefined) return undefined;
  const showsTime = options.hour !== undefined || options.timeStyle !== undefined;
  if (!showsTime || options.hour12 !== undefined || options.hourCycle !== undefined) return options;
  return { ...options, ...clockOption(currentFormats()) };
}

interface Installed {
  readonly appDates?: true;
}

/** Puts the app's date formatter in place of the engine's (once; later calls do nothing). */
export function installAppDateTimeFormat(): void {
  const engine = Intl.DateTimeFormat;
  if ((engine as Installed).appDates === true) return;
  function DateTimeFormat(
    locales?: string | readonly string[],
    options?: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    return new engine(
      appDateLocales(locales) as string | string[] | undefined,
      withAppClock(options),
    );
  }
  Object.assign(DateTimeFormat, {
    prototype: engine.prototype,
    supportedLocalesOf: engine.supportedLocalesOf.bind(engine),
    appDates: true,
  });
  Intl.DateTimeFormat = DateTimeFormat as unknown as typeof Intl.DateTimeFormat;
}
