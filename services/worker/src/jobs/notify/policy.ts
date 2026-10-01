/**
 * The router's routing decision (docs/api-contracts-async.md §2.2 `notify.route`): pure, so the
 * budget, quiet-hours and governor rules are property-tested in isolation from the database.
 *
 * Order: stale items are dropped; SILENT and LOCAL are not routed here (their own queues / the
 * device own them); ALWAYS is sent no matter what; a muted category drops; ROUNDUP-only waits for
 * the roundup; a BUDGET item is held while the app is on screen when it asks to be, dropped past
 * the paywall governor, and otherwise rolls into the roundup in quiet hours or once the day's
 * budget is spent (a kind that is not capped never runs out of budget).
 */
import type { NotificationClass } from '@cp/domain';

import { paywallAllowed } from './governor';

export type RoundupReason = 'roundup_class' | 'quiet_hours' | 'budget_exhausted';
export type DropReason =
  'expired' | 'not_routed' | 'pref_off' | 'in_foreground' | 'paywall_governor' | 'no_push_token';

export type Decision =
  | { readonly action: 'send' }
  | { readonly action: 'roundup'; readonly reason: RoundupReason }
  | { readonly action: 'drop'; readonly reason: DropReason };

export interface QuietHours {
  /** Minutes after local midnight the quiet window starts. */
  readonly fromMinutes: number;
  readonly toMinutes: number;
}

export interface DecideInput {
  readonly class: NotificationClass;
  readonly paywall: boolean;
  readonly onlyIfBackgrounded: boolean;
  /** Counts toward the daily budget (`NotificationSpec.capped`). */
  readonly capped: boolean;
  readonly prefEnabled: boolean;
  readonly expired: boolean;
  readonly inForeground: boolean;
  /** Recipient's local clock, minutes after midnight. */
  readonly localMinutes: number;
  readonly quiet: QuietHours;
  readonly budgetPerDay: number;
  /** BUDGET pushes already sent on the recipient's local date. */
  readonly sentBudgeted: number;
  /** Paywall-class pushes already sent on the recipient's local date. */
  readonly paywallSent: number;
}

/** Quiet windows may wrap midnight (22:00–07:00); an empty window (from = to) is never quiet. */
export function inQuietHours(minutes: number, quiet: QuietHours): boolean {
  const { fromMinutes: from, toMinutes: to } = quiet;
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

export function decide(input: DecideInput): Decision {
  if (input.expired) return { action: 'drop', reason: 'expired' };
  if (input.class === 'silent' || input.class === 'local') {
    return { action: 'drop', reason: 'not_routed' };
  }
  if (input.class === 'always') return { action: 'send' };
  if (!input.prefEnabled) return { action: 'drop', reason: 'pref_off' };
  if (input.class === 'roundup_only') return { action: 'roundup', reason: 'roundup_class' };
  if (input.onlyIfBackgrounded && input.inForeground) {
    return { action: 'drop', reason: 'in_foreground' };
  }
  if (input.paywall && !paywallAllowed(input.paywallSent)) {
    return { action: 'drop', reason: 'paywall_governor' };
  }
  if (inQuietHours(input.localMinutes, input.quiet)) {
    return { action: 'roundup', reason: 'quiet_hours' };
  }
  if (input.capped && input.sentBudgeted >= input.budgetPerDay) {
    return { action: 'roundup', reason: 'budget_exhausted' };
  }
  return { action: 'send' };
}

/** `HH:MM` or `HH:MM:SS` (Postgres `time` text) → minutes after midnight. */
export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export interface LocalClock {
  /** `YYYY-MM-DD` in the zone. */
  readonly date: string;
  readonly minutes: number;
}

/** The wall clock in `tz` at `instant`. */
export function localClock(instant: Date, tz: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
