/**
 * User- and trip-scoped capability bundles (docs/product-decisions.md's final entitlement matrix),
 * mirroring the two materialised tables the server writes (`user_entitlements`, `trip_entitlements`):
 * a capability that needs both a user's and a trip's state (`guideUnlimited`, `sponsored`) stays a
 * standalone combinator in `resolve.ts` rather than living in either bundle, since it is not really
 * "owned" by just one of them.
 */
import { boostActive, iconStylesAll, passPlus, redraftLimit, seatCap } from './resolve';
import { type Clock, type EntitlementSource } from './sources';

export interface UserCapabilities {
  readonly passPlus: boolean;
  /** All app icon styles, not just the default + free alternates (Boost never grants this). */
  readonly iconStylesAll: boolean;
  readonly nextFlightWidget: boolean;
  readonly mailboxImport: boolean;
  readonly spokenReadout: boolean;
  readonly printedPostcardSender: boolean;
}

/**
 * NEXT FLIGHT/mailbox import/spoken read-out/printed postcard all gate identically to `passPlus(u)`
 * in the matrix (Free "–", Pass+ "✓", Boost "–", FTF "✓", crew-yearly "buyer ✓" only) — `passPlus`
 * already encodes the crew-yearly-buyer-only and FTF-member clauses, so no separate formula is
 * needed for any of the four.
 */
export function resolveUserCapabilities(
  sources: readonly EntitlementSource[],
  userId: string,
  clock: Clock,
): UserCapabilities {
  const hasPassPlus = passPlus(sources, userId, clock);
  return {
    passPlus: hasPassPlus,
    iconStylesAll: iconStylesAll(sources, userId, clock),
    nextFlightWidget: hasPassPlus,
    mailboxImport: hasPassPlus,
    spokenReadout: hasPassPlus,
    printedPostcardSender: hasPassPlus,
  };
}

export interface TripCapabilities {
  readonly boostActive: boolean;
  readonly redraftLimit: number;
  readonly seatCap: number;
  /** Live crew map, ETAs, meet-up, PING ALL, crew LA, crew widget — one row in the matrix, all
   * gated identically to `boostActive(t)`. */
  readonly liveMap: boolean;
}

export function resolveTripCapabilities(
  sources: readonly EntitlementSource[],
  tripId: string,
  crewId: string,
  clock: Clock,
): TripCapabilities {
  const active = boostActive(sources, tripId, crewId, clock);
  return {
    boostActive: active,
    redraftLimit: redraftLimit(active),
    seatCap: seatCap(active),
    liveMap: active,
  };
}
