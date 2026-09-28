/**
 * Turns the timeline into list rows: a day separator whenever the viewer's calendar day changes
 * (TODAY, then the weekday within the week, then the date), the "NEW" divider before the first
 * crewmate message past the read marker, and each message flagged as the start or continuation of
 * a run from the same sender (runs break at a day, the divider, a system row or after 5 minutes).
 */
/* eslint-disable lingui/no-unlocalized-strings -- row kinds and keys, never copy. */
import type { ChatMessage } from '../data/rows';

export const GROUP_GAP_MS = 5 * 60 * 1000;

export type TimelineRow =
  | { readonly kind: 'day'; readonly key: string; readonly day: string }
  | { readonly kind: 'unread'; readonly key: string }
  | {
      readonly kind: 'message';
      readonly key: string;
      readonly message: ChatMessage;
      /** First of a run: shows the avatar and the name. */
      readonly first: boolean;
      /** Last of a run: gets the bubble's tail corner. */
      readonly last: boolean;
    };

/** `YYYY-MM-DD` of an instant in the viewer's zone. */
export function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return parts;
}

function sameRun(a: ChatMessage, b: ChatMessage): boolean {
  if (a.senderKind === 'system' || b.senderKind === 'system') return false;
  if (a.senderKind !== b.senderKind || a.senderId !== b.senderId) return false;
  return Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= GROUP_GAP_MS;
}

export function buildTimelineRows(
  messages: readonly ChatMessage[],
  options: { readonly me: string; readonly lastReadSeq: number; readonly timeZone: string },
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let day: string | null = null;
  let unreadPlaced = false;
  let previous: ChatMessage | null = null;
  for (const message of messages) {
    const messageDay = dayKey(message.createdAt, options.timeZone);
    let broke = false;
    if (messageDay !== day && message.seq !== null) {
      rows.push({ kind: 'day', key: `day-${messageDay}`, day: messageDay });
      day = messageDay;
      broke = true;
    }
    const unread =
      !unreadPlaced &&
      options.lastReadSeq > 0 &&
      message.seq !== null &&
      message.seq > options.lastReadSeq &&
      message.senderId !== options.me &&
      message.senderKind !== 'system';
    if (unread) {
      rows.push({ kind: 'unread', key: 'unread' });
      unreadPlaced = true;
      broke = true;
    }
    const continues = !broke && previous !== null && sameRun(previous, message);
    if (continues) {
      const last = rows.at(-1);
      if (last?.kind === 'message') rows[rows.length - 1] = { ...last, last: false };
    }
    rows.push({ kind: 'message', key: message.id, message, first: !continues, last: true });
    previous = message;
  }
  return rows;
}
