/**
 * What the lock-screen sheet (5a-6) shows after asking the server to put the crew's meet-up on
 * every member's lock screen (`request_crew_lock_screen`): the Boost offer on an unboosted trip,
 * a confirmation on a boosted one, or why it could not be done. The server decides; the sheet
 * only reads its answer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes, reasons and Intl option values, never copy. */
import type { RequestCrewLockScreenResult } from '@cp/domain';
import { clockOption } from '@/lib/i18n/formats';

export type OfferPhase =
  | { readonly kind: 'asking' }
  /** Not boosted: the offer, with the quiet way out. */
  | { readonly kind: 'offer' }
  /** Boosted: it is on every lock screen from `startsAt` (now, or half an hour before). */
  | { readonly kind: 'started'; readonly meetupId: string; readonly startsAt: string }
  | { readonly kind: 'no_meetup' }
  | { readonly kind: 'unavailable'; readonly why: 'offline' | 'switched_off' | 'failed' };

/** The command's outcome as `useCommand().send` reports it. */
export type LockScreenOutcome =
  | { readonly kind: 'applied'; readonly result: unknown }
  | { readonly kind: 'rejected'; readonly code: string; readonly detail?: unknown }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'queued' };

function reasonOf(detail: unknown): string | null {
  const reason = (detail as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

export function phaseFor(outcome: LockScreenOutcome): OfferPhase {
  if (outcome.kind === 'applied') {
    const result = outcome.result as Partial<RequestCrewLockScreenResult> | null | undefined;
    if (typeof result?.meetup_id === 'string' && typeof result.starts_at === 'string') {
      return { kind: 'started', meetupId: result.meetup_id, startsAt: result.starts_at };
    }
    return { kind: 'unavailable', why: 'failed' };
  }
  if (outcome.kind === 'rejected') {
    if (outcome.code === 'ENTITLEMENT_REQUIRED') return { kind: 'offer' };
    const reason = reasonOf(outcome.detail);
    if (outcome.code === 'NOT_FOUND' && reason === 'no_meetup') return { kind: 'no_meetup' };
    if (outcome.code === 'STATE_INVALID' && reason === 'switched_off') {
      return { kind: 'unavailable', why: 'switched_off' };
    }
    return { kind: 'unavailable', why: 'failed' };
  }
  // The command is online-only: it is never queued, and no answer means no connection.
  return { kind: 'unavailable', why: 'offline' };
}

/** What the sheet knows about the trip from the phone's own rows. */
export interface OfferFacts {
  /** The trip's place, as the sheet names it ("Kyoto"); null until the trip has one. */
  readonly tripName: string | null;
  readonly meetup: { readonly placeName: string; readonly meetAt: Date } | null;
  /** The crew holding a seat, in joining order (first names; null when a name has not synced). */
  readonly crew: readonly (string | null)[];
}

export interface PreviewDot {
  /** The member's place in joining order: their avatar colour. */
  readonly joinIndex: number;
  readonly name: string;
  /** 0 (far end) to 1 (the meet-up). */
  readonly x: number;
  /** Rows off the line: 0, 1 or -1. */
  readonly row: number;
}

/**
 * The crew spread along the preview's line. The sheet is an illustration of the lock screen, not
 * the live activity: the phone has no ETAs for an unboosted trip, so members are spaced evenly in
 * joining order and staggered so their dots do not touch.
 */
export function previewDots(crew: OfferFacts['crew'], max = 8): PreviewDot[] {
  const shown = crew.slice(0, max);
  return shown.map((name, index) => ({
    joinIndex: index,
    name: name ?? '?',
    x: shown.length === 1 ? 0.5 : (index + 0.5) / shown.length,
    row: [0, 1, -1][index % 3] ?? 0,
  }));
}

/** "17:00" in a zone (the device's own when the trip has none yet). */
export function clockTime(at: Date, locale: string, tz: string | null): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    hourCycle: 'h23',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(at);
}

/** A start more than a minute away is announced with its time; anything sooner is "now". */
export function startsLater(startsAt: string, now: Date): boolean {
  return new Date(startsAt).getTime() - now.getTime() > 60_000;
}
