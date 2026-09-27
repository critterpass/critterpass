/**
 * Silent fair-use decisions (docs/product-decisions.md §3: "on breach degrade to Haiku, then a
 * neutral 'busy' guide line; never a paywall, never shown"). The cap itself (`entitlement_limits` /
 * `ops_config fair_use.*`, e.g. 300 guide turns/user/day) is server config a caller passes in here —
 * this function only turns a running count against that cap into one of the three decisions.
 *
 * The doc names two degrade stages but only one numeric cap per metric, not two thresholds: read
 * literally, "breach -> degrade, THEN busy" describes a sequence over repeated breaches of the same
 * cap, not a second, undocumented number. So the first unit that crosses the cap degrades to Haiku;
 * every further unit in the same window is treated as sustained abuse and gets the neutral "busy"
 * line instead. Documented here as the assumption it is — no source gives a numeric ratio for a
 * second tier.
 */

export const FAIR_USE_DECISIONS = ['ok', 'degrade_haiku', 'busy'] as const;
export type FairUseDecision = (typeof FAIR_USE_DECISIONS)[number];

/**
 * `count` is the running total for this (subject, metric, window) *after* the current unit is
 * counted (i.e. what `app.bump_fair_use` returns), so `count === cap` is still `'ok'` — the unit
 * that took the count to exactly the cap is the last free one, not the first breach.
 */
export function fairUseDecision(count: number, cap: number): FairUseDecision {
  if (count <= cap) return 'ok';
  if (count === cap + 1) return 'degrade_haiku';
  return 'busy';
}
