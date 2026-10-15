/**
 * A curated place's planning facts (`pois.editorial.curated`, from the researchers' places file)
 * over its AI profile's: the curated times of day, meal role and dish win wherever the line has
 * them, and the profile fills only what the line left out. Its essential rank orders it among a
 * first visit's essentials, and its taste tags join the row's tags the candidate pools match
 * crew tastes against. The visit length needs nothing here: the loader writes it as the note's
 * `time_needed_min`, which wins as the editors' visit length.
 */
import type { CuratedNote } from '@cp/domain';
import type { ProfileFacts } from '@cp/planner';

/** The typed facts a place is planned from: the curated line's first, then its profile's. */
export function typedFactsWithCurated(
  profile: ProfileFacts | null,
  curated: CuratedNote | null,
): ProfileFacts | null {
  const times = curated?.best_times ?? [];
  if (curated === null || (times.length === 0 && !curated.meal_role && !curated.dish)) {
    return profile;
  }
  return {
    bestTimes: times.length > 0 ? times : (profile?.bestTimes ?? []),
    visitMin: profile?.visitMin ?? null,
    mealRole: curated.meal_role ?? profile?.mealRole ?? null,
    dish: curated.dish ?? profile?.dish ?? null,
  };
}

/** The place's rank among the essentials: the curated rank, else first for an editors' essential. */
export function essentialRankOf(curated: CuratedNote | null, essential: boolean): number | null {
  return curated?.essential_rank ?? (essential ? 1 : null);
}

/** The row's tags with the curated taste tags added. */
export function tagsWithCurated(tags: readonly string[], curated: CuratedNote | null): string[] {
  return [...new Set([...tags, ...(curated?.tags ?? [])])];
}
