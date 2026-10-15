/**
 * Dates and clocks the way the app writes them, whoever builds the formatter: every
 * `Intl.DateTimeFormat` in the app (the shared `format.date`, a screen's own formatter, Lingui's
 * dates) goes through this one, installed once at launch.
 *
 * - English writes the day before the month ("Mon 12 Oct", "26 Sep 2026"), as the design does,
 *   not the US order ("Oct 12") the bare `en` tag gives.
 * - A time with no 12/24-hour choice of its own takes the one from Settings, 24-hour by default
 *   (`clockOption`), so a formatter that forgot to ask never writes "3:08 PM".
 * - A range writes a span inside one month as the days only ("5–11 Nov"), the same on every
 *   engine: the phone's own range wrote "5 Nov–11".
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

type Moment = Date | number;

const joined = (parts: readonly Intl.DateTimeFormatPart[]): string =>
  parts.map((part) => part.value).join('');

/**
 * A range from one formatter's parts: one date when both read the same, the days spanned when
 * only the day differs ("5–11 Nov", "5–11 thg 11"), else both in full with a spaced dash.
 */
export function appFormatRange(format: Intl.DateTimeFormat, from: Moment, to: Moment): string {
  const a = format.formatToParts(from);
  const b = format.formatToParts(to);
  if (joined(a) === joined(b)) return joined(a);
  const differ = a.filter((part, at) => part.value !== b[at]?.value).map((part) => part.type);
  if (a.length === b.length && differ.length === 1 && differ[0] === 'day') {
    return a
      .map((part, at) => (part.type === 'day' ? `${part.value}–${b[at]?.value ?? ''}` : part.value))
      .join('');
  }
  return `${joined(a)} – ${joined(b)}`;
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
    const format = new engine(
      appDateLocales(locales) as string | string[] | undefined,
      withAppClock(options),
    );
    Object.defineProperty(format, 'formatRange', {
      value: (from: Moment, to: Moment) => appFormatRange(format, from, to),
    });
    return format;
  }
  Object.assign(DateTimeFormat, {
    prototype: engine.prototype,
    supportedLocalesOf: engine.supportedLocalesOf.bind(engine),
    appDates: true,
  });
  Intl.DateTimeFormat = DateTimeFormat as unknown as typeof Intl.DateTimeFormat;
}
