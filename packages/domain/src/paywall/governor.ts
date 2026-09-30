/**
 * The paywall governor (docs/product-decisions.md §3 "Paywall governor"): one pure rule set the
 * app runs before showing any paywall and the server runs before any paywall push or crew card.
 * At most one unsolicited paywall per local day; never on day-of screens, Help, SOS (and its map)
 * or disruption flows, nor within 10 minutes of an error; a quiet no hides that offer for its trip;
 * explicit navigation (plan chips, Your plan, the widget gallery) is never held back.
 */
import {
  PAYWALL_ENTRIES,
  type PaywallEntryPoint,
  type PaywallOutcome,
  type PaywallSuppressContext,
} from './entries';

/** A paywall shown within this long after an error would read as blame; it waits. */
export const PAYWALL_ERROR_QUIET_MS = 10 * 60 * 1000;
/** Unsolicited paywalls per local day. */
export const PAYWALL_DAILY_CAP = 1;

export interface PaywallImpressionLike {
  readonly entryPoint: PaywallEntryPoint;
  readonly tripId: string | null;
  readonly outcome: PaywallOutcome;
  readonly governed: boolean;
  /** `YYYY-MM-DD` on the device when it happened. */
  readonly localDate: string;
}

export interface PaywallRequest {
  readonly entry: PaywallEntryPoint;
  readonly tripId: string | null;
  /** Today on the device (`YYYY-MM-DD`, its own time zone). */
  readonly localDate: string;
  readonly now: Date;
  /** What the screen is right now. */
  readonly contexts: readonly PaywallSuppressContext[];
  readonly lastErrorAt: Date | null;
  readonly impressions: readonly PaywallImpressionLike[];
}

export type PaywallDecision =
  | { readonly show: true; readonly governed: boolean }
  | {
      readonly show: false;
      readonly reason: 'suppressed_context' | 'recent_error' | 'quiet_no' | 'daily_cap';
    };

export function canShowPaywall(request: PaywallRequest): PaywallDecision {
  const entry = PAYWALL_ENTRIES[request.entry];
  if (request.contexts.some((context) => entry.suppressContexts.includes(context))) {
    return { show: false, reason: 'suppressed_context' };
  }
  if (
    entry.quietNoPerTrip &&
    request.tripId !== null &&
    request.impressions.some(
      (seen) =>
        seen.entryPoint === request.entry &&
        seen.tripId === request.tripId &&
        seen.outcome === 'quiet_no',
    )
  ) {
    return { show: false, reason: 'quiet_no' };
  }
  if (!entry.governed) return { show: true, governed: false };
  if (
    request.lastErrorAt !== null &&
    request.now.getTime() - request.lastErrorAt.getTime() < PAYWALL_ERROR_QUIET_MS
  ) {
    return { show: false, reason: 'recent_error' };
  }
  const shownToday = request.impressions.filter(
    (seen) => seen.governed && seen.outcome === 'shown' && seen.localDate === request.localDate,
  ).length;
  if (shownToday >= PAYWALL_DAILY_CAP) return { show: false, reason: 'daily_cap' };
  return { show: true, governed: true };
}
