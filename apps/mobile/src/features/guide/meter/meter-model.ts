/**
 * The guide meter as the sheet shows it (docs/product-decisions.md: 30 free answers a device-local
 * day; Pass+ unlimited; a boosted trip unlimited as "UNLIMITED {GUIDE}"). The synced counter is
 * the base; the streaming answer's `usage` and a refused ask's details are newer and win. The
 * countdown comes from `reset_at` only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl format options, never copy. */
import { GUIDE_FREE_DAILY_LIMIT } from '@cp/domain';

export type GuideMeter =
  | {
      readonly kind: 'free';
      readonly used: number;
      readonly limit: number;
      /** The next local midnight; null before the first answer of the day. */
      readonly resetAt: string | null;
    }
  | { readonly kind: 'unlimited' }
  | { readonly kind: 'boosted' };

export interface MeterInputs {
  readonly passUnlimited: boolean;
  readonly tripBoosted: boolean;
  readonly counter: {
    readonly count: number;
    readonly limit: number;
    readonly resetAt: string;
  } | null;
  readonly live: { readonly used: number; readonly limit: number; readonly resetAt: string } | null;
  readonly spent: {
    readonly used: number;
    readonly limit: number;
    readonly resetAt: string | null;
  } | null;
}

export function guideMeter(input: MeterInputs, now: Date): GuideMeter {
  if (input.passUnlimited) return { kind: 'unlimited' };
  if (input.tripBoosted) return { kind: 'boosted' };
  const counter =
    input.counter !== null && Date.parse(input.counter.resetAt) > now.getTime()
      ? { used: input.counter.count, limit: input.counter.limit, resetAt: input.counter.resetAt }
      : null;
  // Numbers from before the last reset no longer count.
  const current = <T extends { readonly resetAt: string | null }>(value: T | null): T | null =>
    value !== null && (value.resetAt === null || Date.parse(value.resetAt) > now.getTime())
      ? value
      : null;
  const newest = current(input.spent) ?? current(input.live) ?? counter;
  if (newest === null) {
    return { kind: 'free', used: 0, limit: GUIDE_FREE_DAILY_LIMIT, resetAt: null };
  }
  const used = Math.max(newest.used, counter?.used ?? 0);
  return {
    kind: 'free',
    used,
    limit: newest.limit > 0 ? newest.limit : GUIDE_FREE_DAILY_LIMIT,
    resetAt: newest.resetAt ?? counter?.resetAt ?? null,
  };
}

export function isSpent(meter: GuideMeter): boolean {
  return meter.kind === 'free' && meter.used >= meter.limit;
}

/** Whole hours and minutes until `resetAt` (never negative). */
export function untilReset(resetAt: string, now: Date): { hours: number; minutes: number } {
  const ms = Math.max(0, Date.parse(resetAt) - now.getTime());
  const total = Math.ceil(ms / 60_000);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** The reset's wall-clock time on this device ("00:00"). */
export function resetClock(resetAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(resetAt));
}
