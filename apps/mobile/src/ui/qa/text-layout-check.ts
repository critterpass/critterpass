import type { UiQaCode } from './ui-qa';

interface Line {
  readonly text: string;
}

/** Letters and digits of space-separated scripts: a break between two of them splits a word. */
const WORD_CHAR = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u;

function lastChar(value: string): string {
  return [...value].at(-1) ?? '';
}

/**
 * True when the platform broke a line inside a word ("SG" / "N", "ISSU" / "ED"): the line ends and
 * the next begins with a word character. A word-wrapped line keeps its trailing space, and scripts
 * written without spaces (CJK, Thai) break between characters by design, so neither counts.
 */
export function hasWordBreak(lines: readonly Line[]): boolean {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const end = lastChar(lines[index]?.text ?? '');
    const start = [...(lines[index + 1]?.text ?? '')][0] ?? '';
    if (WORD_CHAR.test(end) && WORD_CHAR.test(start)) return true;
  }
  return false;
}

function compact(value: string): string {
  return value.replace(/\s+/gu, '');
}

/** True when the rendered lines lost characters of `fullText` (an ellipsis or a clipped line). */
export function isTruncated(lines: readonly Line[], fullText: string): boolean {
  const rendered = compact(lines.map((line) => line.text).join(''));
  const full = compact(fullText);
  if (rendered.length < full.length) return true;
  return rendered.endsWith('…') && !full.endsWith('…');
}

export interface TextLayoutCheck {
  readonly lines: readonly Line[];
  readonly text: string;
  /** False when the caller chose the line limit itself: its ellipsis is intended. */
  readonly truncationIsBug: boolean;
  /**
   * The auto-fit had to cut the text at its floor. iOS reports a truncated line with its full
   * text, so the lines alone can't show that cut.
   */
  readonly cutByFit?: boolean;
  /** The design sets this text on one line (button, pill and chip labels): a second line is a bug. */
  readonly singleLine?: boolean;
}

/** The problems one settled text layout shows. */
export function textLayoutProblems({
  lines,
  text,
  truncationIsBug,
  cutByFit = false,
  singleLine = false,
}: TextLayoutCheck): UiQaCode[] {
  const problems: UiQaCode[] = [];
  /* eslint-disable lingui/no-unlocalized-strings -- report codes, never shown to a user */
  if (truncationIsBug && (cutByFit || isTruncated(lines, text))) problems.push('TEXT_TRUNCATED');
  if (hasWordBreak(lines)) problems.push('TEXT_WORD_BROKEN');
  if (singleLine && lines.length > 1) problems.push('TEXT_WRAPPED');
  /* eslint-enable lingui/no-unlocalized-strings */
  return problems;
}
