/**
 * The named boolean/number formulas from docs/product-decisions.md's final entitlement matrix
 * ("Resolution rules"), implemented exactly as written there. `passPlus`/`boostActive`/`iconStylesAll`
 * scan raw sources; `guideUnlimited`/`redraftLimit`/`seatCap`/`sponsored` are pure combinators over
 * already-resolved booleans, matching how the doc itself defines them in terms of `passPlus`/
 * `boostActive` rather than independently.
 */
import { type Clock, type EntitlementSource, type StoreSubSource } from './sources';

function toMs(iso: string): number {
  return Date.parse(iso);
}

/** Whether a `store_sub` source currently grants Pass+ (excludes 'paused', which only keeps icon
 * styles — see `iconStylesAll` — and excludes 'expired'/'revoked'). Re-derives from the dated
 * fields rather than trusting `status` alone: a stale status past its own period/grace end is
 * treated as expired. */
function storeSubEntitled(source: StoreSubSource, now: Date): boolean {
  const nowMs = now.getTime();
  switch (source.status) {
    case 'active':
      return true;
    case 'cancelled_active':
      return nowMs <= toMs(source.currentPeriodEnd);
    case 'grace':
    case 'billing_retry':
      return source.graceEndsAt !== undefined && nowMs <= toMs(source.graceEndsAt);
    case 'paused':
    case 'expired':
    case 'revoked':
      return false;
  }
}

/**
 * `passPlus(u) = active store sub ∨ billing grace ∨ cancelled-in-period ∨ gift/promo time ∨
 * crew-yearly buyer ∨ FTF active on any of u's trips.` `sources` should already be scoped to user
 * `userId` (all their store subs, FTF grants across their trips, crew-year grants across their
 * crews, code grants) — this function does not itself filter by owner.
 */
export function passPlus(
  sources: readonly EntitlementSource[],
  userId: string,
  clock: Clock,
): boolean {
  const now = clock.now();
  const nowMs = now.getTime();
  return sources.some((source) => {
    switch (source.kind) {
      case 'store_sub':
        return storeSubEntitled(source, now);
      case 'ftf':
        return nowMs <= toMs(source.endsAt);
      case 'crew_year':
        return (
          source.buyerUserId === userId &&
          nowMs >= toMs(source.validFrom) &&
          nowMs <= toMs(source.validTo)
        );
      case 'code_grant':
        return nowMs <= toMs(source.expiresAt);
      case 'trip_boost':
        // Boost alone never grants Pass+: no mailbox import, no icon styles, no NEXT FLIGHT widget.
        return false;
    }
  });
}

/**
 * `boostActive(t) = paid boost window ∨ FTF ∨ crew-yearly covering t's crew.` `sources` should
 * already be scoped to trip `tripId`'s crew (that trip's own boost/FTF, plus any crew-year grant
 * for `crewId`).
 */
export function boostActive(
  sources: readonly EntitlementSource[],
  tripId: string,
  crewId: string,
  clock: Clock,
): boolean {
  const nowMs = clock.now().getTime();
  return sources.some((source) => {
    switch (source.kind) {
      case 'trip_boost':
        return (
          source.tripId === tripId &&
          source.status !== 'revoked' &&
          source.status !== 'moved' &&
          source.status !== 'credit' &&
          nowMs <= toMs(source.endsAt)
        );
      case 'ftf':
        return source.tripId === tripId && nowMs <= toMs(source.endsAt);
      case 'crew_year':
        return (
          source.crewId === crewId &&
          nowMs >= toMs(source.validFrom) &&
          nowMs <= toMs(source.validTo)
        );
      case 'store_sub':
      case 'code_grant':
        return false;
    }
  });
}

/** Pass+ keeps icon styles through the emulated "paused" overlay even though it loses unlimited
 * guide/mailbox import/NEXT FLIGHT there (product-decisions lifecycle overlays) — the one capability
 * that is not simply `passPlus(u)`, so it needs the raw sources rather than a resolved boolean. */
export function iconStylesAll(
  sources: readonly EntitlementSource[],
  userId: string,
  clock: Clock,
): boolean {
  if (passPlus(sources, userId, clock)) {
    return true;
  }
  return sources.some((source) => source.kind === 'store_sub' && source.status === 'paused');
}

export function guideUnlimited(passPlusValue: boolean, boostActiveValue: boolean): boolean {
  return passPlusValue || boostActiveValue;
}

export function redraftLimit(boostActiveValue: boolean): number {
  return boostActiveValue ? Infinity : 3;
}

export function seatCap(boostActiveValue: boolean): number {
  return boostActiveValue ? 16 : 6;
}

/** `sponsored(u, t) = ¬passPlus(u) ∧ ¬boostActive(t)`. */
export function sponsored(passPlusValue: boolean, boostActiveValue: boolean): boolean {
  return !passPlusValue && !boostActiveValue;
}

/** `helpMap(u, t) = u in active Help/SOS session on t` — that session's own state lives outside the
 * entitlement sources entirely (a different subsystem), so this is an explicit pass-through rather
 * than something derived from `EntitlementSource`. */
export function helpMap(activeHelpSosSession: boolean): boolean {
  return activeHelpSosSession;
}
