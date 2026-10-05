/**
 * A guide's slug is its critter's name folded to plain lowercase letters ("Ngựa" → "ngua",
 * "Chà Vá" → "chava"). The database folds the same way in `app.guide_slug`; a database test proves
 * the two agree for every name in the dex.
 */

/** Letters Unicode decomposition leaves whole, as Postgres `unaccent` writes them. */
const WHOLE_LETTERS: Readonly<Record<string, string>> = {
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ł: 'l',
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

export const GUIDE_SLUG_PATTERN = /^[a-z]{2,16}$/;

export function guideSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[đðøłıßæœþ]/gu, (letter) => WHOLE_LETTERS[letter] ?? '')
    .replace(/[^a-z]/gu, '');
}
