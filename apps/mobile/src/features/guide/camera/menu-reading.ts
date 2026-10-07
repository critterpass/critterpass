/**
 * The menu route's answer as it streams (`POST /v1/camera/menu`, `text/event-stream`): one `item`
 * per dish, then `done` with the status, the guide's suggestion, the menu's language and the
 * members whose flags were checked. A stream that reports an `error` or ends without `done`
 * rejects with `{code, reason?}`, as a refusal before the stream does, and the scan turns either
 * into its own line.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire frame types and codes, never copy. */
import type { GuideFrame } from '../chat/data/guide-frames';
import type { MenuFlag, MenuItem, MenuPrice, MenuReading } from './menu-scan';

export class MenuReadingError extends Error {
  constructor(
    readonly code: string | null,
    readonly reason: string | null = null,
  ) {
    super(code ?? 'menu reading dropped');
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function flagsOf(value: unknown): MenuFlag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const flag = (entry ?? {}) as Record<string, unknown>;
    const member = text(flag['member']);
    if (member === '' || (flag['verdict'] !== 'ok' && flag['verdict'] !== 'clash')) return [];
    return [{ member, verdict: flag['verdict'], reason: text(flag['reason']) }];
  });
}

function priceOf(value: unknown): MenuPrice | null {
  if (typeof value !== 'object' || value === null) return null;
  const price = value as Record<string, unknown>;
  const printed = text(price['printed']);
  if (printed === '') return null;
  return {
    printed,
    amountMinor: typeof price['amount_minor'] === 'number' ? price['amount_minor'] : null,
    currency: typeof price['currency'] === 'string' ? price['currency'] : null,
  };
}

/** One `item` frame as a dish; null when it names no line or carries no translation. */
export function menuItemOf(data: Record<string, unknown>): MenuItem | null {
  const id = text(data['ocr_line_id']);
  const translation = text(data['translation']);
  if (id === '' || translation === '') return null;
  return {
    ocr_line_id: id,
    translation,
    description: text(data['description']),
    spice: typeof data['spice'] === 'number' ? data['spice'] : null,
    flags: flagsOf(data['flags']),
    price: priceOf(data['price']),
  };
}

/** Folds the stream's frames into the reading; `done` closes it. */
export function createMenuReadingFold(): {
  frame(frame: GuideFrame): void;
  result(): MenuReading;
} {
  const items: MenuItem[] = [];
  let done: Record<string, unknown> | null = null;
  let failed: MenuReadingError | null = null;
  return {
    frame({ type, data }) {
      if (type === 'item') {
        const item = menuItemOf(data);
        if (item !== null) items.push(item);
      } else if (type === 'done') {
        done = data;
      } else if (type === 'error') {
        failed = new MenuReadingError(text(data['code']) || null);
      }
    },
    result() {
      // A stream that ended without `done` was cut: the reading is not shown half-read.
      if (failed !== null || done === null) throw failed ?? new MenuReadingError(null);
      const status = done['status'];
      const members = done['checked_members'];
      return {
        status: status === 'ok' || status === 'no_dishes' ? status : 'failed',
        items,
        suggestion: text(done['suggestion']) || null,
        checked_members: Array.isArray(members)
          ? members.filter((member): member is string => typeof member === 'string')
          : [],
        source_language: text(done['source_language']) || null,
      };
    },
  };
}
