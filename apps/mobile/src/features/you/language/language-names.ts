/**
 * The languages a person can pick. Each is named twice: in its own script (data, from the locale
 * registry) and in the app's current language (copy, so a Vietnamese phone reads "Tiếng Nhật").
 */
import { shippedLocales } from '@cp/i18n';
import { t } from '@lingui/core/macro';

export interface LanguageChoice {
  readonly code: string;
  /** "Tiếng Việt" */
  readonly nativeName: string;
  /** "Vietnamese" in an English app, "Tiếng Việt" in a Vietnamese one. */
  readonly localName: string;
}

/** A language's name in the app's current language; the registry's English name if it is new. */
export function localLanguageName(code: string, englishName: string): string {
  switch (code) {
    case 'en':
      return t({ id: 'you.language.name.en', message: 'English' });
    case 'zh-Hans':
      return t({ id: 'you.language.name.zhHans', message: 'Chinese, simplified' });
    case 'id':
      return t({ id: 'you.language.name.id', message: 'Indonesian' });
    case 'ja':
      return t({ id: 'you.language.name.ja', message: 'Japanese' });
    case 'es':
      return t({ id: 'you.language.name.es', message: 'Spanish' });
    case 'pt':
      return t({ id: 'you.language.name.pt', message: 'Portuguese' });
    case 'fr':
      return t({ id: 'you.language.name.fr', message: 'French' });
    case 'ko':
      return t({ id: 'you.language.name.ko', message: 'Korean' });
    case 'th':
      return t({ id: 'you.language.name.th', message: 'Thai' });
    case 'vi':
      return t({ id: 'you.language.name.vi', message: 'Vietnamese' });
    default:
      return englishName;
  }
}

/** Every shipped language (never the pseudo locale), the current one first. */
export function languageChoices(current: string): readonly LanguageChoice[] {
  const choices = shippedLocales
    .filter((entry) => entry.pseudo !== true)
    .map((entry) => ({
      code: entry.code,
      nativeName: entry.nativeName,
      localName: localLanguageName(entry.code, entry.englishName),
    }));
  const first = choices.filter((choice) => choice.code === current);
  return [...first, ...choices.filter((choice) => choice.code !== current)];
}

export function nativeNameOf(code: string): string {
  return shippedLocales.find((entry) => entry.code === code)?.nativeName ?? code;
}

/** Languages listed before "N more" (3n-8 shows four). */
export const FEATURED_LANGUAGES = 4;

/**
 * The few languages shown before "N more": the current one, then the phone's own preferred
 * languages the app ships, then English; the rest follow in the usual order.
 */
export function featuredLanguages(
  choices: readonly LanguageChoice[],
  deviceLanguages: readonly string[],
  count = FEATURED_LANGUAGES,
): { readonly featured: readonly LanguageChoice[]; readonly more: readonly LanguageChoice[] } {
  const base = (code: string) => code.split(/[-_]/u, 1)[0]?.toLowerCase() ?? '';
  const picked: LanguageChoice[] = [];
  const add = (choice: LanguageChoice | undefined) => {
    if (choice !== undefined && !picked.includes(choice) && picked.length < count) {
      picked.push(choice);
    }
  };
  add(choices[0]);
  for (const language of deviceLanguages) {
    add(choices.find((choice) => base(choice.code) === base(language)));
  }
  add(choices.find((choice) => choice.code === 'en'));
  for (const choice of choices) add(choice);
  return { featured: picked, more: choices.filter((choice) => !picked.includes(choice)) };
}
