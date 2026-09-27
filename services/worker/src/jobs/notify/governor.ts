/**
 * The paywall governor (docs/product-decisions.md: at most one paywall-class push per user per
 * local day). The count lives in `ping_ledger.paywall_sent`, bumped in the same transaction as the
 * send decision, so two concurrent routes for one user cannot both slip under the limit.
 */
export const PAYWALL_PUSHES_PER_DAY = 1;

export function paywallAllowed(paywallSentToday: number): boolean {
  return paywallSentToday < PAYWALL_PUSHES_PER_DAY;
}
