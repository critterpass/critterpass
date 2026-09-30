/**
 * Which critters can be met right now, and where: the trip pack's spawn rules resolved to their
 * spots, one rule per spot per day (the crew's shared rotation), minus forms already found, then
 * gated by the legendary window, the solar condition, the set count, and the home set's
 * foreground-only Explore at home opt-in. Everything is local, so it works with no signal.
 */
import {
  homeCollectGate,
  rotationPick,
  spawnGate,
  toLocalWallTime,
  type WindowRule,
} from '@cp/domain';

import {
  ruleRow,
  spotsFor,
  type SpawnPoiRow,
  type SpawnSpot,
  type SpawnSqlRow,
} from '../data/spawn-rows';

export interface SpawnCandidate {
  readonly rule: SpawnSqlRow;
  readonly spot: SpawnSpot;
  /** The trip it counts for; null in the home set with Explore at home. */
  readonly tripId: string | null;
}

export interface FeedInput {
  readonly rules: readonly SpawnSqlRow[];
  readonly pois: ReadonlyMap<string, SpawnPoiRow>;
  /** Legendary windows by id (a rule's `window_id`). */
  readonly windows: ReadonlyMap<string, WindowRule>;
  /** Set id → its country. */
  readonly setCountry: ReadonlyMap<string, string>;
  /** Forms the traveller already owns (verified or waiting to be). */
  readonly ownedForms: ReadonlySet<string>;
  /** Owned forms per set, for `set_count` rules. */
  readonly ownedInSet: ReadonlyMap<string, number>;
  /** The trip under way (or about to be), when there is one. */
  readonly trip: { readonly id: string; readonly destinationId: string | null } | null;
  readonly homeCountry: string | null;
  readonly exploreAtHome: boolean;
  readonly foreground: boolean;
  readonly now: Date;
  /** The place's zone, for its calendar day. */
  readonly tz: string;
}

export function spawnCandidates(input: FeedInput): SpawnCandidate[] {
  const localDate = toLocalWallTime(input.now, input.tz).date;
  const bySpot = new Map<
    string,
    { spot: SpawnSpot; rules: SpawnSqlRow[]; tripId: string | null }
  >();
  for (const rule of input.rules) {
    if (input.ownedForms.has(rule.form_id)) continue;
    const country = input.setCountry.get(rule.set_id) ?? '';
    const inTrip =
      input.trip !== null &&
      input.trip.destinationId !== null &&
      rule.destination_id === input.trip.destinationId;
    const home = homeCollectGate({
      setCountry: country,
      homeCountry: input.homeCountry,
      exploreAtHome: input.exploreAtHome,
      foreground: input.foreground,
    });
    const atHome = input.homeCountry !== null && country === input.homeCountry.toUpperCase();
    // A trip's own spawns always count (a trip in your home country too); outside a trip only the
    // home set does, with Explore at home on and the app in front.
    if (!inTrip && !(atHome && home === 'allowed')) continue;
    if (rule.foreground_only === 1 && !input.foreground) continue;
    for (const spot of spotsFor(rule, input.pois)) {
      const entry = bySpot.get(spot.placeKey) ?? {
        spot,
        rules: [],
        tripId: inTrip ? (input.trip?.id ?? null) : null,
      };
      entry.rules.push(rule);
      bySpot.set(spot.placeKey, entry);
    }
  }
  const out: SpawnCandidate[] = [];
  for (const [placeKey, entry] of bySpot) {
    const open = entry.rules.filter(
      (rule) =>
        spawnGate(ruleRow(rule), {
          at: input.now,
          localDate,
          lat: entry.spot.lat,
          lng: entry.spot.lng,
          window: rule.window_id === null ? null : (input.windows.get(rule.window_id) ?? null),
          ownedInSet: input.ownedInSet.get(rule.set_id) ?? 0,
          placesDone: 0,
        }) === 'open',
    );
    const rule = rotationPick(entry.tripId ?? 'home', localDate, placeKey, open);
    if (rule !== undefined) out.push({ rule, spot: entry.spot, tripId: entry.tripId });
  }
  return out;
}
