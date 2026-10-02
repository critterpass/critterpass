/**
 * Country and region names in the app's languages. Hermes has no `Intl.DisplayNames` on iPhone (and
 * answers with the bare code elsewhere), so the names ship with the app: one table per language,
 * written from CLDR for every code the phone step can dial (`new Intl.DisplayNames([locale],
 * { type: 'region' })` under Node, over packages/content/onboarding/dial-codes.json).
 */
import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import id from './id.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import ms from './ms.json';
import nl from './nl.json';
import pl from './pl.json';
import pt from './pt.json';
import th from './th.json';
import tr from './tr.json';
import vi from './vi.json';
import zhHans from './zh-Hans.json';

const TABLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  de: de,
  en: en,
  es: es,
  fr: fr,
  id: id,
  it: it,
  ja: ja,
  ko: ko,
  ms: ms,
  nl: nl,
  pl: pl,
  pt: pt,
  th: th,
  tr: tr,
  vi: vi,
  'zh-Hans': zhHans,
};

function tableFor(locale: string): Readonly<Record<string, string>> | undefined {
  const exact = TABLES[locale];
  if (exact !== undefined) return exact;
  const language = locale.split(/[-_]/u, 1)[0] ?? '';
  const key = Object.keys(TABLES).find(
    (name) => name === language || name.startsWith(`${language}-`),
  );
  return key === undefined ? undefined : TABLES[key];
}

/** The region's name in `locale`, in English when the language has no table; undefined for a code nobody dials. */
export function regionName(code: string, locale: string): string | undefined {
  return tableFor(locale)?.[code] ?? TABLES.en?.[code];
}
