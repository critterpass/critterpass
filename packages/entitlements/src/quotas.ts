/**
 * Meter decisions over an already-counted `usage_counters` row (docs/product-decisions.md §3 guide
 * meter, C13 redrafts). The atomic increment itself is `app.consume_quota`
 * (packages/db/migrations/*_entitlements_and_meters.sql); everything here is pure so the client can
 * reach the identical decision offline over a synced row, and a test never needs Postgres to cover
 * the boundary cases (29th/30th/31st question, exemptions, tz-change reset guard's *outcome*).
 */
import { type QuotaExhaustedDetail, type RedraftLimitDetail } from '@cp/domain';

export interface GuideMeterInput {
  /** System guide work (pitch, draft, fit, proposal, briefing, disruptions, quests, recap, Help/SOS)
   * is unmetered regardless of who or what triggered it. */
  readonly isSystemWork: boolean;
  /** `guideUnlimited(asker, trip)` (./resolve.ts): the asker's own Pass+ or the trip's Boost. */
  readonly askerGuideUnlimited: boolean;
  readonly isCrewChat: boolean;
  /** Other crew members whose own Pass+ makes a crew-chat ask unmetered for everyone in it
   * (docs/product-decisions.md §3: "asker's meter unless any member has Pass+"). Empty/absent outside
   * crew chat, or when checking the asker's own meter is still required. */
  readonly crewPassHolders?: readonly string[];
}

export type GuideMeterReason = 'system' | 'unlimited' | 'crew_pass_holder';

export type GuideMeterSubject =
  { readonly metered: false; readonly reason: GuideMeterReason } | { readonly metered: true };

/** Whether this guide ask should consume the 30/day meter at all, before any count is looked up. */
export function guideMeterSubject(input: GuideMeterInput): GuideMeterSubject {
  if (input.isSystemWork) return { metered: false, reason: 'system' };
  if (input.askerGuideUnlimited) return { metered: false, reason: 'unlimited' };
  if (input.isCrewChat && (input.crewPassHolders?.length ?? 0) > 0) {
    return { metered: false, reason: 'crew_pass_holder' };
  }
  return { metered: true };
}

export interface QuotaState {
  readonly used: number;
  readonly limit: number;
  /** ISO instant with offset — the wire shape `QuotaExhaustedDetail.resetAt` already expects. */
  readonly resetAt: string;
}

export type QuotaDecision =
  | { readonly ok: true; readonly used: number; readonly limit: number; readonly resetAt: string }
  | { readonly ok: false; readonly detail: QuotaExhaustedDetail };

/**
 * `used < limit` is the free 30/day gate: the 30th question has `used === 29` going in (allowed,
 * becomes the 30th), the 31st has `used === 30` (exhausted). `crewPassHolders` is echoed into the
 * detail only when non-empty, matching `quotaExhaustedDetailSchema`'s optional field.
 */
export function quotaDecision(
  state: QuotaState,
  crewPassHolders?: readonly string[],
): QuotaDecision {
  if (state.used < state.limit) {
    return { ok: true, used: state.used, limit: state.limit, resetAt: state.resetAt };
  }
  return {
    ok: false,
    detail: {
      used: state.used,
      limit: state.limit,
      resetAt: state.resetAt,
      ...(crewPassHolders !== undefined && crewPassHolders.length > 0
        ? { crewPassHolders: [...crewPassHolders] }
        : {}),
    },
  };
}

export type RedraftReservationDecision =
  { readonly ok: true } | { readonly ok: false; readonly detail: RedraftLimitDetail };

/**
 * The free-tier visible redraft cap (3/trip, crew-wide, C13). `limit === Infinity` is Boost/FTF/crew
 * yearly (`redraftLimit()` in ./resolve.ts): those trips never see `REDRAFT_LIMIT` here — the silent
 * fair-use cap (20/trip/day, ./fair-use.ts) governs them instead, and a breach there degrades rather
 * than blocking (never a paywall on an already-unlimited tier).
 */
export function redraftReservationDecision(
  used: number,
  limit: number,
): RedraftReservationDecision {
  if (limit === Infinity || used < limit) return { ok: true };
  return { ok: false, detail: { used, limit } };
}
