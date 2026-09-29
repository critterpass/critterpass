/**
 * The writing system a language hint asks the recogniser to read. Android's ML Kit reads
 * `latin`, `chinese`, `japanese`, `korean` and `devanagari`; iOS Vision reads what its current
 * revision lists. Any other script makes the native side answer `unsupported_script`, and the
 * server transcribes the photo instead.
 */
export type OcrScript =
  | 'latin'
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'devanagari'
  | 'thai'
  | 'lao'
  | 'khmer'
  | 'myanmar'
  | 'arabic'
  | 'hebrew'
  | 'cyrillic'
  | 'greek'
  | 'georgian'
  | 'armenian'
  | 'bengali'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'gujarati'
  | 'gurmukhi'
  | 'odia'
  | 'sinhala'
  | 'ethiopic'
  | 'tibetan'
  | 'thaana';

/** Languages not written in Latin letters by default; every other language hint reads as Latin. */
const LANGUAGE_SCRIPTS: Readonly<Record<string, OcrScript>> = {
  zh: 'chinese',
  yue: 'chinese',
  ja: 'japanese',
  ko: 'korean',
  hi: 'devanagari',
  mr: 'devanagari',
  ne: 'devanagari',
  sa: 'devanagari',
  kok: 'devanagari',
  mai: 'devanagari',
  th: 'thai',
  lo: 'lao',
  km: 'khmer',
  my: 'myanmar',
  ar: 'arabic',
  fa: 'arabic',
  ur: 'arabic',
  ps: 'arabic',
  he: 'hebrew',
  yi: 'hebrew',
  ru: 'cyrillic',
  uk: 'cyrillic',
  be: 'cyrillic',
  bg: 'cyrillic',
  mk: 'cyrillic',
  sr: 'cyrillic',
  kk: 'cyrillic',
  ky: 'cyrillic',
  tg: 'cyrillic',
  mn: 'cyrillic',
  el: 'greek',
  ka: 'georgian',
  hy: 'armenian',
  bn: 'bengali',
  as: 'bengali',
  ta: 'tamil',
  te: 'telugu',
  kn: 'kannada',
  ml: 'malayalam',
  gu: 'gujarati',
  pa: 'gurmukhi',
  or: 'odia',
  si: 'sinhala',
  am: 'ethiopic',
  ti: 'ethiopic',
  bo: 'tibetan',
  dv: 'thaana',
};

/** ISO 15924 script subtags that override the language's default (`sr-Latn`, `zh-Hant`). */
const SUBTAG_SCRIPTS: Readonly<Record<string, OcrScript>> = {
  latn: 'latin',
  hans: 'chinese',
  hant: 'chinese',
  hani: 'chinese',
  jpan: 'japanese',
  kore: 'korean',
  hang: 'korean',
  deva: 'devanagari',
  thai: 'thai',
  cyrl: 'cyrillic',
  arab: 'arabic',
};

export interface LanguageHint {
  readonly language: string;
  readonly script: OcrScript;
}

/** The script a BCP 47 tag is written in (`th` → thai, `sr-Latn` → latin, `vi` → latin). */
export function scriptOf(tag: string): OcrScript {
  const [primary = '', ...rest] = tag.trim().toLowerCase().split(/[-_]/u);
  const subtag = rest.find((part) => part.length === 4);
  return (subtag && SUBTAG_SCRIPTS[subtag]) || LANGUAGE_SCRIPTS[primary] || 'latin';
}

/** Trimmed, de-duplicated hints in the caller's order, each with its script. */
export function languageHints(languages: readonly string[]): LanguageHint[] {
  const seen = new Set<string>();
  const hints: LanguageHint[] = [];
  for (const raw of languages) {
    const language = raw.trim().replace(/_/gu, '-');
    const key = language.toLowerCase();
    if (language.length === 0 || seen.has(key)) continue;
    seen.add(key);
    hints.push({ language, script: scriptOf(language) });
  }
  return hints;
}
