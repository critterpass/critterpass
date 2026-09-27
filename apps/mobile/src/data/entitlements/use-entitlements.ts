/**
 * Client-side entitlement gating (docs/product-decisions.md §3: "client uses the same pure engine
 * over synced rows for UI gating (4b-1 meter, locked widget states); server stays authoritative").
 *
 * Inputs mirror the materialised `user_entitlements`/`trip_entitlements`/`usage_counters`/`perks`
 * rows (services/api/src/entitlements/materialise.ts) rather than raw `EntitlementSource[]`: the app
 * never sees purchase data directly, only the server's already-resolved booleans. There is no
 * PowerSync client wired up in this app yet (bootstrap-only, confirmed by reading apps/mobile/src/) —
 * a screen passes the synced rows it already has, the same "explicit args now, live source later"
 * shape `usePriceFormatter` (apps/mobile/src/data/money) already uses.
 */
import {
  enabledPerks,
  quotaDecision,
  type Perk,
  type QuotaDecision,
  type QuotaState,
} from '@cp/entitlements';
import { useMemo } from 'react';

export interface UserEntitlementsInput {
  readonly passPlus: boolean;
  readonly guideUnlimitedGlobal: boolean;
  /** Mirrors `user_entitlements.icon_styles`: non-empty means every style is unlocked. */
  readonly iconStyles: readonly string[];
}

export interface TripEntitlementsInput {
  readonly boostActive: boolean;
  readonly seatCap: number;
  /** `Infinity` for an unlimited trip (already converted from the stored sentinel by the caller). */
  readonly redraftLimit: number;
  readonly liveMap: boolean;
  /** The trip-only baseline (`!boostActive`) `trip_entitlements.sponsored` stores — this hook
   * combines it with `user.passPlus` below to get the true per-viewer answer. */
  readonly sponsored: boolean;
}

export interface UseEntitlementsInput {
  readonly user?: UserEntitlementsInput;
  readonly trip?: TripEntitlementsInput;
  /** The guide meter's current `usage_counters` row; absent when the asker is unmetered (system
   * work, Pass+/Boost, or a crew-chat Pass+ holder) so `guideMeter` below has nothing to decide. */
  readonly guideUsage?: QuotaState;
  /** Every synced `perks` row (server-driven: only `enabled` ones render, sorted, and never
   * hard-coded client-side). */
  readonly perks?: readonly Perk[];
}

export interface UseEntitlementsResult {
  readonly passPlus: boolean;
  /** `passPlus` OR the given trip's own Boost — matches `guideUnlimited(u,t)`. */
  readonly guideUnlimited: boolean;
  readonly iconStylesAll: boolean;
  readonly boostActive: boolean;
  readonly seatCap: number | undefined;
  readonly redraftLimit: number | undefined;
  readonly liveMap: boolean;
  /** The final, per-viewer sponsored-content decision (`undefined` outside a trip context, where
   * sponsored picks are simply not applicable). */
  readonly sponsored: boolean | undefined;
  /** `undefined` when the asker is unmetered — a locked-state UI should never render a meter row. */
  readonly guideMeter: QuotaDecision | undefined;
  readonly perks: readonly Perk[];
}

const EMPTY_PERKS: readonly Perk[] = [];

/** Builds the UI-facing entitlement view, memoised so it stays referentially stable across renders
 * where none of the synced inputs changed. */
export function useEntitlements(input: UseEntitlementsInput): UseEntitlementsResult {
  // A stable module-level default, not an inline `perks = []`: a fresh array literal on every
  // call/render would otherwise break the useMemo identity check below whenever the caller omits
  // `perks` (the same pitfall usePriceFormatter's own identity test guards against).
  const { user, trip, guideUsage, perks = EMPTY_PERKS } = input;

  return useMemo<UseEntitlementsResult>(() => {
    const passPlus = user?.passPlus ?? false;
    return {
      passPlus,
      guideUnlimited: (user?.guideUnlimitedGlobal ?? false) || (trip?.boostActive ?? false),
      iconStylesAll: (user?.iconStyles.length ?? 0) > 0,
      boostActive: trip?.boostActive ?? false,
      seatCap: trip?.seatCap,
      redraftLimit: trip?.redraftLimit,
      liveMap: trip?.liveMap ?? false,
      sponsored: trip === undefined ? undefined : trip.sponsored && !passPlus,
      guideMeter: guideUsage === undefined ? undefined : quotaDecision(guideUsage),
      perks: enabledPerks(perks),
    };
  }, [user, trip, guideUsage, perks]);
}
