/** ICAO 9303 machine-readable-zone character set: A–Z, 0–9 and the `<` filler. */
const FILLER = '<';

/** Transliterates to the MRZ alphabet: strips diacritics (Nguyễn → NGUYEN), đ → D, other marks → `<`. */
export function toMrz(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'D')
    .replace(/ß/g, 'SS')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, FILLER);
}

/**
 * One MRZ line: fields transliterated, joined by `<<`, padded (or cut) to `length` with `<`.
 * Purely decorative in the app, so no check digits.
 */
export function mrzLine(fields: readonly string[], length = 44): string {
  const body = fields.map(toMrz).join(FILLER.repeat(2));
  return body.slice(0, length).padEnd(length, FILLER);
}
