/**
 * The home set: the set of the country of the traveller's home airport. Collecting there
 * needs the explicit, foreground-only "Explore at home" opt-in (`user_settings.explore_at_home`);
 * away from home every set collects normally.
 */
export interface HomeSetCandidate {
  readonly id: string;
  readonly country: string;
  readonly rank: number | null;
}

/** The home country's set; the best-ranked one when a country has several. */
export function homeSetFor<T extends HomeSetCandidate>(
  homeCountry: string | null,
  sets: readonly T[],
): T | undefined {
  if (homeCountry === null) return undefined;
  const country = homeCountry.toUpperCase();
  return sets
    .filter((set) => set.country.toUpperCase() === country)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0];
}

export type HomeCollectGate = 'allowed' | 'home_needs_opt_in' | 'home_needs_foreground';

/** Whether a spawn in `setCountry` may accrue for this traveller right now. */
export function homeCollectGate(input: {
  readonly setCountry: string;
  readonly homeCountry: string | null;
  readonly exploreAtHome: boolean;
  readonly foreground: boolean;
}): HomeCollectGate {
  const atHome =
    input.homeCountry !== null &&
    input.homeCountry.toUpperCase() === input.setCountry.toUpperCase();
  if (!atHome) return 'allowed';
  if (!input.exploreAtHome) return 'home_needs_opt_in';
  return input.foreground ? 'allowed' : 'home_needs_foreground';
}
