/**
 * The private objection's answer as the phone reads it (`submit_private_reason`: the thread and
 * the options the cost engine decided), and when "ask me later" lands: a time before the answer is
 * due, named for what it is (tonight, tomorrow morning, Sunday).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */

export interface PrivateOption {
  readonly id: string;
  readonly kind: 'skip_item' | 'ask_crew' | 'follow_up';
  readonly label: string;
  readonly deltaMinor: number | null;
  readonly displayDeltaMinor: number | null;
  readonly currency: string | null;
}

interface WireOption {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly label?: unknown;
  readonly delta_minor?: unknown;
  readonly display_delta_minor?: unknown;
  readonly currency?: unknown;
}

const KINDS = new Set(['skip_item', 'ask_crew', 'follow_up']);

function minor(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+$/u.test(value)) return Number(value);
  return null;
}

export function parseOptions(
  result: unknown,
): { threadId: string; options: PrivateOption[] } | null {
  const body = result as { thread_id?: unknown; options?: unknown } | null;
  if (body === null || typeof body.thread_id !== 'string' || !Array.isArray(body.options)) {
    return null;
  }
  const options = (body.options as WireOption[]).flatMap((o): PrivateOption[] =>
    typeof o.id === 'string' && typeof o.kind === 'string' && KINDS.has(o.kind)
      ? [
          {
            id: o.id,
            kind: o.kind as PrivateOption['kind'],
            label: typeof o.label === 'string' ? o.label : '',
            deltaMinor: minor(o.delta_minor),
            displayDeltaMinor: minor(o.display_delta_minor),
            currency: typeof o.currency === 'string' ? o.currency : null,
          },
        ]
      : [],
  );
  return { threadId: body.thread_id, options };
}

const pad = (n: number) => String(n).padStart(2, '0');

const localStamp = (at: Date): string =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:00`;

/** When the guide asks again, on the member's clock, and how the sheet names it. */
export interface FollowUp {
  readonly when: 'tonight' | 'tomorrow' | 'sunday';
  /** "YYYY-MM-DDTHH:00" on the device's clock. */
  readonly atLocal: string;
}

/** The guide asks again at least this long before the answer is due, so there is time to give it. */
const BEFORE_REPLY_BY_MS = 2 * 3_600_000;
/** Too close to "now" to be worth a reminder. */
const SOONEST_MS = 3_600_000;

/**
 * The time "ask me later" lands: the coming Sunday evening when the answer is not due before it,
 * else this evening (19:00), else tomorrow morning (09:00), whichever is far enough from now and
 * early enough before the reply-by date. Null when the answer is due too soon for a reminder to
 * help: the sheet then offers none. A Sunday that is today reads as "tonight".
 */
export function followUpAt(now: Date, replyBy: string | null): FollowUp | null {
  const due = replyBy === null ? Number.POSITIVE_INFINITY : new Date(replyBy).getTime();
  const fits = (at: Date) =>
    at.getTime() - now.getTime() >= SOONEST_MS && due - at.getTime() >= BEFORE_REPLY_BY_MS;
  const tonight = new Date(now);
  tonight.setHours(19, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const sunday = new Date(tonight);
  sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7));
  const sameDay = sunday.getDate() === tonight.getDate();
  if (!sameDay && fits(sunday)) return { when: 'sunday', atLocal: localStamp(sunday) };
  if (fits(tonight)) return { when: 'tonight', atLocal: localStamp(tonight) };
  if (fits(tomorrow)) return { when: 'tomorrow', atLocal: localStamp(tomorrow) };
  return null;
}
