/**
 * The private objection's answer as the phone reads it (`submit_private_reason`: the thread and
 * the options the cost engine decided), and when "Ask me on Sunday" lands: the coming Sunday at
 * 19:00 on the member's clock (today, when it is Sunday and still before then).
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

/** "YYYY-MM-DDT19:00" for the coming Sunday evening, on the device's clock. */
export function nextSundayEvening(now: Date): string {
  const at = new Date(now);
  at.setHours(19, 0, 0, 0);
  const ahead = (7 - at.getDay()) % 7;
  at.setDate(at.getDate() + (ahead === 0 && now.getTime() >= at.getTime() ? 7 : ahead));
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T19:00`;
}
