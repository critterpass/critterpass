/**
 * The roundup's rows for its expanded view (the `cp.roundup` poster: up to five rows, each a
 * kind icon, a bold title and a line under it, tapping through to its own screen). The push's `cp`
 * block holds 1 KB, so the rows give way in order: links first (the poster then opens the inbox),
 * then the lines under titles, then rows from the end.
 */
import { jsonBytes } from '@cp/domain';

export const ROUNDUP_LINES_MAX = 5;
/** What the rows may take of the 1 KB `cp` block (the rest is the sender, ids and flags). */
export const ROUNDUP_LINES_BYTES = 640;
const TITLE_MAX = 40;
const SUB_MAX = 64;

export interface RoundupLineSource {
  /** The rolled-up notification's catalogue key: the poster picks its icon from it. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string | null;
}

export interface RoundupLine {
  readonly kind: string;
  readonly title: string;
  readonly sub?: string;
  readonly deeplink?: string;
}

function clip(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

export function roundupLines(
  sources: readonly RoundupLineSource[],
  budget: number = ROUNDUP_LINES_BYTES,
): RoundupLine[] {
  let lines: RoundupLine[] = sources.slice(0, ROUNDUP_LINES_MAX).map((source) => ({
    kind: source.key,
    title: clip(source.title, TITLE_MAX),
    ...(source.body.trim() === '' ? {} : { sub: clip(source.body, SUB_MAX) }),
    ...(source.deepLink === null ? {} : { deeplink: source.deepLink }),
  }));
  if (jsonBytes(lines) > budget) lines = lines.map(({ deeplink: _, ...line }) => line);
  if (jsonBytes(lines) > budget) lines = lines.map(({ sub: _, ...line }) => line);
  while (lines.length > 0 && jsonBytes(lines) > budget) lines = lines.slice(0, -1);
  return lines;
}
