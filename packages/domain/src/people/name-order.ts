/**
 * Which way round a full name is written. Vietnamese (like Chinese, Korean and Japanese) puts the
 * family name first, so the name a person is called by is the last word; Western names put it
 * first. The display name is one free-text field, so the order is read from the name itself.
 */

/** Family names common enough that a name starting with one is family-name first. */
const VIETNAMESE_FAMILY = new Set([
  'nguyen',
  'tran',
  'pham',
  'hoang',
  'huynh',
  'phan',
  'vu',
  'vo',
  'dang',
  'bui',
  'do',
  'ngo',
  'duong',
  'trinh',
  'dinh',
  'truong',
  'doan',
  'luong',
  'quach',
  'thai',
  'tang',
  'trieu',
]);

/** Family names that are also Western first names ("Le", "Ly", "Mai"): they need more evidence. */
const SHARED_FAMILY = new Set(['le', 'ly', 'ho', 'mai', 'lam', 'cao', 'ha', 'lu', 'ta', 'kim']);

/** Vietnamese middle names that mark the order on their own ("Văn", "Thị"). */
const VIETNAMESE_MIDDLE = new Set(['van', 'thi']);

/**
 * Letters only Vietnamese writes: đ, ă, ơ, ư, and vowels carrying a dot below, a hook above, or a
 * tilde no other Latin language puts there.
 */
const VIETNAMESE_LETTERS = /[đăơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/iu;

const HAN_HANGUL_KANA = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const LETTER = /\p{L}/u;

/** The words of a name that hold a letter: emoji and punctuation alone are not a name. */
export function nameWords(name: string): readonly string[] {
  return name
    .trim()
    .split(/\s+/u)
    .filter((word) => LETTER.test(word));
}

function plain(word: string): string {
  return word.toLowerCase().replace(/đ/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '');
}

/** True when the words read family name first (so the last word is the given name). */
export function familyNameFirst(words: readonly string[]): boolean {
  const first = words[0];
  if (first === undefined || words.length < 2) return false;
  if (HAN_HANGUL_KANA.test(first)) return true;
  const family = plain(first);
  if (VIETNAMESE_FAMILY.has(family)) return true;
  // Written Western way round ("Hân Đặng"): the family name is last.
  const last = plain(words[words.length - 1] ?? '');
  if (VIETNAMESE_FAMILY.has(last) || SHARED_FAMILY.has(last)) {
    if (!SHARED_FAMILY.has(family)) return false;
  }
  const vietnamese = words.some((word) => VIETNAMESE_LETTERS.test(word));
  const middle = words.length >= 3 && VIETNAMESE_MIDDLE.has(plain(words[1] ?? ''));
  if (SHARED_FAMILY.has(family)) return vietnamese || middle || words.length >= 3;
  return vietnamese || middle;
}

/**
 * The word of a full name a person is called by: the given name of a family-name-first name
 * ("Hân" of "Đặng Thị Ngọc Hân"), the first word of a Western one ("Maya" of "Maya Tan"); null
 * when the name holds no letters.
 */
export function calledByName(name: string): string | null {
  const words = nameWords(name);
  if (words.length === 0) return null;
  return (familyNameFirst(words) ? words[words.length - 1] : words[0]) ?? null;
}
