/**
 * The pass's machine-readable zone: two 44-character lines drawn from ICAO 9303's alphabet (A–Z,
 * 0–9, `<`). Names are transliterated per ICAO 9303 Part 3 (Latin diacritics folded, the listed
 * multi-letter mappings, Cyrillic and Greek tables); any character without a mapping becomes `<`,
 * which leaves the displayed name untouched. Layout follows the designed pass:
 *
 *   P<SGPWINSTON<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
 *   CP0427<<SGP<<SUNRISE<FOOD<EASY<<<<<<<<<<<<01
 *
 * Line 1: `P<`, the home country (ISO alpha-3, `CP` until a home is set), the given name.
 * Line 2: the pass number, the home country, the travel-style tokens, and a two-digit stamp count.
 */
import { TASTE_TAG_MRZ, type TasteTag } from '../taste/taxonomy';
import { mrzPassNumber } from './number';

export const MRZ_LINE_LENGTH = 44;

/** ICAO 9303 Part 3 §6 multi-letter and special Latin transliterations. */
const LATIN_SPECIAL: Readonly<Record<string, string>> = {
  Ä: 'AE',
  Å: 'AA',
  Æ: 'AE',
  Ö: 'OE',
  Ø: 'OE',
  Ü: 'UE',
  ß: 'SS',
  Þ: 'TH',
  Ð: 'D',
  Đ: 'D',
  Ħ: 'H',
  Ĳ: 'IJ',
  Ŀ: 'L',
  Ł: 'L',
  Œ: 'OE',
  Ŧ: 'T',
};

/** ICAO 9303 Part 3 Cyrillic table (Russian, Ukrainian, Belarusian, Serbian, Macedonian letters). */
const CYRILLIC: Readonly<Record<string, string>> = {
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'G',
  Ґ: 'G',
  Д: 'D',
  Ђ: 'D',
  Ѓ: 'G',
  Е: 'E',
  Ё: 'E',
  Є: 'IE',
  Ж: 'ZH',
  З: 'Z',
  Ѕ: 'DZ',
  И: 'I',
  І: 'I',
  Ї: 'I',
  Й: 'I',
  Ј: 'J',
  К: 'K',
  Л: 'L',
  Љ: 'LJ',
  М: 'M',
  Н: 'N',
  Њ: 'NJ',
  О: 'O',
  П: 'P',
  Р: 'R',
  С: 'S',
  Т: 'T',
  Ћ: 'C',
  Ќ: 'K',
  У: 'U',
  Ў: 'U',
  Ф: 'F',
  Х: 'KH',
  Ц: 'TS',
  Ч: 'CH',
  Џ: 'DZ',
  Ш: 'SH',
  Щ: 'SHCH',
  Ъ: 'IE',
  Ы: 'Y',
  Ь: '',
  Э: 'E',
  Ю: 'IU',
  Я: 'IA',
};

/** ICAO 9303 Part 3 Greek table (single letters; ΟΥ handled as a pair). */
const GREEK: Readonly<Record<string, string>> = {
  Α: 'A',
  Β: 'V',
  Γ: 'G',
  Δ: 'D',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'I',
  Θ: 'TH',
  Ι: 'I',
  Κ: 'K',
  Λ: 'L',
  Μ: 'M',
  Ν: 'N',
  Ξ: 'X',
  Ο: 'O',
  Π: 'P',
  Ρ: 'R',
  Σ: 'S',
  Τ: 'T',
  Υ: 'Y',
  Φ: 'F',
  Χ: 'CH',
  Ψ: 'PS',
  Ω: 'O',
};

/** Separators that become a filler; apostrophes are dropped (ICAO: O'BRIEN → OBRIEN). */
const FILLER_CHARS = /[\s\-‐‑,.]/u;
const DROPPED_CHARS = /['’ʼ`]/u;

function transliterateChar(ch: string): string {
  if (/^[A-Z0-9]$/u.test(ch)) return ch;
  if (FILLER_CHARS.test(ch)) return '<';
  if (DROPPED_CHARS.test(ch)) return '';
  // Letters with diacritics (Vietnamese, Greek tonos, Й aside) fold to their base letter.
  const base = ch.normalize('NFD').replace(/\p{Mn}/gu, '');
  const special = LATIN_SPECIAL[ch] ?? CYRILLIC[ch] ?? GREEK[ch] ?? GREEK[base];
  if (special !== undefined) return special;
  if (/^[A-Z]$/u.test(base)) return base;
  if (/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/u.test(ch)) return '';
  return '<';
}

/** Transliterates a name into MRZ characters; unmapped characters become `<`, emoji vanish. */
export function mrzName(name: string): string {
  const upper = name.normalize('NFC').toLocaleUpperCase('en-US').replace(/ΟΥ/gu, 'OU');
  let out = '';
  for (const ch of upper) out += transliterateChar(ch);
  return out.replace(/^<+|<+$/gu, '');
}

function fit(text: string, tail = ''): string {
  const room = MRZ_LINE_LENGTH - tail.length;
  const body = text.length > room ? text.slice(0, room) : text.padEnd(room, '<');
  return body + tail;
}

export interface MrzInput {
  readonly givenName: string;
  readonly number: string | null;
  /** ISO alpha-3 of the home country, once a home is set. */
  readonly homeIso3: string | null;
  readonly styleTags: readonly TasteTag[];
  readonly stampCount: number;
}

export function mrzLines(input: MrzInput): readonly [string, string] {
  const country = input.homeIso3 ?? 'CP';
  const line1 = fit(`P<${country}${mrzName(input.givenName)}`);
  const parts = [mrzPassNumber(input.number)];
  if (input.homeIso3 !== null) parts.push(input.homeIso3);
  const style = input.styleTags.map((tag) => TASTE_TAG_MRZ[tag]).join('<');
  if (style.length > 0) parts.push(style);
  const stamps = String(Math.min(99, Math.max(0, Math.trunc(input.stampCount)))).padStart(2, '0');
  const line2 = fit(parts.join('<<'), stamps);
  return [line1, line2];
}
