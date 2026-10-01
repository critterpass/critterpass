/**
 * The languages the app ships in (docs/product-decisions.md, launch languages), as the server
 * knows them: what `set_app_locale` accepts, what `user_settings.app_locale` holds and what
 * `app.user_locale()` resolves to. The app's own registry (`@cp/i18n` `shippedLocaleCodes`) is the
 * source of the list; a test in the app keeps the two identical.
 */
import { z } from 'zod';

export const APP_LOCALES = [
  'en',
  'zh-Hans',
  'id',
  'ja',
  'es',
  'pt',
  'fr',
  'ko',
  'th',
  'vi',
] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

/** The language guide-written text is authored in; everyone without another language reads it. */
export const SOURCE_APP_LOCALE = 'en' satisfies AppLocale;

export const appLocaleSchema = z.enum(APP_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return (APP_LOCALES as readonly unknown[]).includes(value);
}

/** `set_app_locale`: the language this person's app is showing right now. */
export const setAppLocalePayloadSchema = z.object({ locale: appLocaleSchema });
export type SetAppLocalePayload = z.infer<typeof setAppLocalePayloadSchema>;
