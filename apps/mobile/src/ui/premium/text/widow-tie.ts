/**
 * No lone word on a paragraph's last line ("It's ready when you / are."): the last two words are
 * tied with a no-break space, so a wrap always carries two of them down together, and three when
 * the last two are short ("or not.", "from here.") and would still look left behind. Lines keep the
 * full width (Android's balanced breaking evened short notes into a narrow ragged block instead).
 */

const NO_BREAK_SPACE = ' ';

/** A tie longer than this would leave a gap at the line's end bigger than the lone word it saves. */
const MAX_TIED = 18;

/** Fewer words than this never wrap into a lone last one worth saving. */
const MIN_WORDS = 3;

/** Two last words this short still read as a stray ("or not.", "from here."): a third joins them. */
const SHORT_PAIR = 10;

/** The text with its last two words tied, or as it was when there is nothing to tie. */
export function tieLastWords(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.includes('\n')) return text;
  const words = trimmed.split(' ');
  if (words.filter((word) => word !== '').length < MIN_WORDS) return text;
  const at = trimmed.lastIndexOf(' ');
  if (at <= 0 || trimmed[at - 1] === ' ') return text;
  const before = trimmed.lastIndexOf(' ', at - 1);
  if (trimmed.length - before - 1 > MAX_TIED) return text;
  const tied = `${trimmed.slice(0, at)}${NO_BREAK_SPACE}${trimmed.slice(at + 1)}`;
  const third =
    before > 0 && trimmed[before - 1] !== ' ' ? trimmed.lastIndexOf(' ', before - 1) : -2;
  const three =
    words.length > MIN_WORDS &&
    trimmed.length - before - 1 <= SHORT_PAIR &&
    third >= -1 &&
    trimmed.length - third - 1 <= MAX_TIED;
  const out = three ? `${tied.slice(0, before)}${NO_BREAK_SPACE}${tied.slice(before + 1)}` : tied;
  return `${out}${text.slice(trimmed.length)}`;
}
