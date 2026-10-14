/**
 * A base destination's critter, in order: the admin-region override; the nearest critter of its
 * own country within `NEAREST_MAX_KM` when it is clearly nearest (the runner-up of the country is
 * at least `CLEAR_RATIO` times as far, or the country has one critter); otherwise a residual Jev
 * question over at most four candidates (the country's nearest three, then the nearest elsewhere),
 * whose fallback is the globally nearest critter. Every destination ends with a critter.
 */
import { haversineKm } from './base-set';
import type { CritterHome } from './critter-regions';

export const NEAREST_MAX_KM = 350;
export const CLEAR_RATIO = 1.5;
export const MAX_CANDIDATES = 4;

export const CRITTER_MATCH_METHODS = ['override', 'nearest', 'jev', 'global'] as const;
export type CritterMatchMethod = (typeof CRITTER_MATCH_METHODS)[number];

export interface CritterMatch {
  readonly critterKey: string;
  readonly method: CritterMatchMethod;
  readonly distanceKm: number;
  readonly confidence?: number;
}

export interface MatchTarget {
  readonly countryCode: string;
  readonly admin1: string | null;
  readonly lat: number;
  readonly lng: number;
}

export type MatchOutcome =
  | { readonly kind: 'matched'; readonly match: CritterMatch }
  | {
      readonly kind: 'residual';
      /** Keys to choose from, nearest first, with their distances. */
      readonly candidates: readonly { readonly key: string; readonly distanceKm: number }[];
      /** What the destination gets when the question has no confident answer. */
      readonly fallback: CritterMatch;
    };

const round = (km: number) => Math.round(km * 10) / 10;

export function matchCritter(
  target: MatchTarget,
  homes: readonly CritterHome[],
  overrides: Readonly<Record<string, string>>,
): MatchOutcome {
  const ranked = homes
    .map((home) => ({ home, km: haversineKm(target.lat, target.lng, home.lat, home.lng) }))
    .sort((a, b) => a.km - b.km || a.home.key.localeCompare(b.home.key));
  const nearest = ranked[0];
  if (nearest === undefined) throw new Error('no critter homes to match against');
  const override =
    target.admin1 === null ? undefined : overrides[`${target.countryCode}:${target.admin1}`];
  const overridden = ranked.find((entry) => entry.home.key === override);
  if (overridden !== undefined) {
    return {
      kind: 'matched',
      match: {
        critterKey: overridden.home.key,
        method: 'override',
        distanceKm: round(overridden.km),
      },
    };
  }
  const own = ranked.filter((entry) => entry.home.country === target.countryCode);
  const [first, second] = own;
  if (
    first !== undefined &&
    first.km <= NEAREST_MAX_KM &&
    (second === undefined || second.km >= first.km * CLEAR_RATIO)
  ) {
    return {
      kind: 'matched',
      match: { critterKey: first.home.key, method: 'nearest', distanceKm: round(first.km) },
    };
  }
  const fallback: CritterMatch = {
    critterKey: nearest.home.key,
    method: 'global',
    distanceKm: round(nearest.km),
  };
  // The country's nearest three and the nearest critter anywhere else; with none in the country,
  // the nearest three anywhere.
  const picks = own.slice(0, 3);
  const size = own.length > 0 ? Math.min(MAX_CANDIDATES, picks.length + 1) : 3;
  for (const entry of ranked) {
    if (picks.length >= size) break;
    if (!picks.includes(entry)) picks.push(entry);
  }
  if (picks.length < 2) return { kind: 'matched', match: fallback };
  return {
    kind: 'residual',
    candidates: picks.map((entry) => ({ key: entry.home.key, distanceKm: round(entry.km) })),
    fallback,
  };
}
