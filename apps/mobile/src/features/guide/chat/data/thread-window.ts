/**
 * How much of a guide thread is on screen, and when the sheet follows its end.
 *
 * A long thread shows its latest messages; "Earlier messages" adds a page above them. The window
 * starts at a message, not at a count, so answers arriving at the end never push shown ones out.
 * The sheet opens at the end and stays there while the reader is at the end; once they scroll up
 * to read, a growing answer no longer pulls them back.
 */

/** Saved messages shown when a thread opens, and added by each "Earlier messages". */
export const THREAD_PAGE = 30;

/** How close to the end still counts as reading the end (points). */
export const END_SLACK = 48;

interface Listed {
  readonly id: string;
  readonly role: 'user' | 'guide';
}

/**
 * Where the shown messages start: at the pinned message, else a page from the end. A window never
 * opens on an answer whose question sits just above it.
 */
export function windowStart(
  messages: readonly Listed[],
  pinnedId: string | null,
  page: number = THREAD_PAGE,
): number {
  if (pinnedId !== null) {
    const pinned = messages.findIndex((message) => message.id === pinnedId);
    if (pinned >= 0) return pinned;
  }
  const start = Math.max(0, messages.length - page);
  return start > 0 && messages[start]?.role === 'guide' && messages[start - 1]?.role === 'user'
    ? start - 1
    : start;
}

/** The message a window starting at `start` is pinned to after "Earlier messages". */
export function earlierPin(
  messages: readonly Listed[],
  start: number,
  page: number = THREAD_PAGE,
): string | null {
  return messages[windowStart(messages.slice(0, start), null, page)]?.id ?? null;
}

export interface ScrollMetrics {
  /** How far the thread is scrolled. */
  readonly offset: number;
  /** The height of the part on screen. */
  readonly viewport: number;
  /** The height of the whole thread. */
  readonly content: number;
}

/** Whether the reader is at the end of the thread (a thread shorter than the screen always is). */
export function atThreadEnd(metrics: ScrollMetrics, slack: number = END_SLACK): boolean {
  return metrics.content - (metrics.offset + metrics.viewport) <= slack;
}

/**
 * Where to scroll after the thread changed height, or null to stay put: the end while the reader
 * is following it; the same line as before when earlier messages were added above it.
 */
export function scrollAfterResize(input: {
  readonly before: ScrollMetrics;
  readonly content: number;
  readonly following: boolean;
  readonly addedAbove: boolean;
}): { readonly y: number } | 'end' | null {
  if (input.addedAbove) {
    const grew = input.content - input.before.content;
    return grew > 0 ? { y: input.before.offset + grew } : null;
  }
  return input.following ? 'end' : null;
}
