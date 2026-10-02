/** The languages a person can pick, each named in its own script and in the app's current one. */
import { shippedLocales, type LocaleEntry } from '@cp/i18n';

export interface LanguageChoice {
  readonly code: string;
  /** "Tiếng Việt" */
  readonly nativeName: string;
  /** "Vietnamese" in an English app, "Tiếng Việt" in a Vietnamese one. */
  readonly localName: string;
}

function nameIn(displayLocale: string, entry: LocaleEntry): string {
  try {
    const names = new Intl.DisplayNames([displayLocale], { type: 'language' });
    return names.of(entry.code) ?? entry.englishName;
  } catch {
    // Engines without Intl.DisplayNames: the English name still says which language it is.
    return entry.englishName;
  }
}

/** Every shipped language (never the pseudo locale), the current one first. */
export function languageChoices(current: string): readonly LanguageChoice[] {
  const choices = shippedLocales
    .filter((entry) => entry.pseudo !== true)
    .map((entry) => ({
      code: entry.code,
      nativeName: entry.nativeName,
      localName: nameIn(current, entry),
    }));
  const first = choices.filter((choice) => choice.code === current);
  return [...first, ...choices.filter((choice) => choice.code !== current)];
}

export function nativeNameOf(code: string): string {
  return shippedLocales.find((entry) => entry.code === code)?.nativeName ?? code;
}
