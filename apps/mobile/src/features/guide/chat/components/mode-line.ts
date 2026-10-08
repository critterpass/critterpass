/**
 * Where the guide header's mode line ("Just me · Bali, Oct 29–Nov 4") may wrap in the narrow
 * column beside the GROUP / JUST ME switch.
 */
const NBSP = '\u00a0';
const WORD_JOINER = '\u2060';

/** A date range that stays on one line: "Oct 29–Nov 4" never breaks at its spaces or its dash. */
export function unbroken(text: string): string {
  return text.replaceAll(' ', NBSP).replaceAll('–', `–${WORD_JOINER}`);
}

/**
 * Where the mode line may wrap beside the switch: the dot stays with the words before it and the
 * last two words stay together, so the line never ends on one word alone.
 */
export function modeLineBreaks(line: string): string {
  const tied = line.replaceAll(' ·', `${NBSP}·`);
  const last = tied.lastIndexOf(' ');
  // Two words or fewer after the dot's tie: nothing left to keep together.
  if (last < 0 || tied.indexOf(' ') === last) return tied;
  return `${tied.slice(0, last)}${NBSP}${tied.slice(last + 1)}`;
}
