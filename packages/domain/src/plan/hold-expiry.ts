/**
 * When a change set's approval vote must close (docs/product-decisions.md C41, C43): no later than
 * the earliest supplier hold on anything it touches, so the crew never votes a held seat into
 * expiry. Holds belong to the supplier layer, which registers its provider at boot; until one is
 * registered there are no holds and the decider policy's default window stands.
 */

/** Runs one parameterised SQL read in the caller's transaction. */
export type ProviderQuery = <Row extends object>(
  sql: string,
  params: readonly unknown[],
) => Promise<readonly Row[]>;

export interface HoldExpiryContext {
  readonly tripId: string;
  /** Stable ids of the plan items the change set touches. */
  readonly stableIds: readonly string[];
  /** Bookings on those items (current version). */
  readonly bookingIds: readonly string[];
  readonly query: ProviderQuery;
}

export interface HoldExpiryProvider {
  /** The earliest hold expiry among the touched items, or null when nothing is held. */
  earliestHoldExpiry(context: HoldExpiryContext): Promise<Date | null>;
}

export const NO_HOLDS: HoldExpiryProvider = { earliestHoldExpiry: () => Promise.resolve(null) };

let holdExpiryProvider: HoldExpiryProvider = NO_HOLDS;

export function registerHoldExpiryProvider(provider: HoldExpiryProvider): void {
  holdExpiryProvider = provider;
}

export function getHoldExpiryProvider(): HoldExpiryProvider {
  return holdExpiryProvider;
}

/** The vote deadline: the policy default, pulled in to the earliest hold expiry when earlier. */
export function clampClosesAt(policyDefault: Date, holdExpiry: Date | null): Date {
  return holdExpiry !== null && holdExpiry < policyDefault ? holdExpiry : policyDefault;
}
