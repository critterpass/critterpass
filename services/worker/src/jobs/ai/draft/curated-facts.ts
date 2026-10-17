/**
 * A curated place's planning facts (`pois.editorial.curated`, from the researchers' places file)
 * over its AI profile's: the curated times of day, meal role and dish win wherever the line has
 * them, and the profile fills only what the line left out. The researchers give every place to eat
 * a meal role, so a line with times of day and none says the place is no eatery, whatever its
 * profile read from the row it was matched to (a tower filed as its restaurant). Its essential rank orders it among a
 * first visit's essentials, and its taste tags join the row's tags the candidate pools match
 * crew tastes against. The visit length needs nothing here: the loader writes it as the note's
 * `time_needed_min`, which wins as the editors' visit length.
 */
import type { CuratedNote } from '@cp/domain';
import type { DraftPoi, ProfileFacts } from '@cp/planner';

/** The typed facts a place is planned from: the curated line's first, then its profile's. */
export function typedFactsWithCurated(
  profile: ProfileFacts | null,
  curated: CuratedNote | null,
): ProfileFacts | null {
  const times = curated?.best_times ?? [];
  if (curated === null || (times.length === 0 && !curated.meal_role && !curated.dish)) {
    return profile;
  }
  const eatery = curated.meal_role !== undefined || times.length === 0;
  return {
    bestTimes: times.length > 0 ? times : (profile?.bestTimes ?? []),
    visitMin: profile?.visitMin ?? null,
    mealRole: curated.meal_role ?? (eatery ? (profile?.mealRole ?? null) : null),
    dish: curated.dish ?? (eatery ? (profile?.dish ?? null) : null),
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

/**
 * What a curated place's line says beyond its typed facts, for the planner: its area, how well
 * known it is, how many itinerary pages hold it, whether it works on a rainy day, and the places
 * people combine with it (those matched to our rows). Nothing for a place without a line.
 */
export function curatedPlaceFacts(
  curated: CuratedNote | null,
): Pick<DraftPoi, 'area' | 'prominence' | 'blogCount' | 'indoor' | 'pairsWith'> {
  if (curated === null) return {};
  const pairs = (curated.pairs_with ?? []).flatMap((pair) => pair.poi_id ?? []);
  return {
    ...(curated.area === undefined ? {} : { area: curated.area }),
    ...(curated.prominence === undefined ? {} : { prominence: curated.prominence }),
    ...(curated.blog_count === undefined ? {} : { blogCount: curated.blog_count }),
    ...(curated.indoor === undefined ? {} : { indoor: curated.indoor }),
    ...(pairs.length === 0 ? {} : { pairsWith: pairs }),
  };
}

/** Kinds open data files places under that are never a sight, nor a meal of their own. */
const NOT_SIGHTS: ReadonlySet<string> = new Set(['food', 'stay', 'transit', 'health']);

/**
 * The kind of place a curated row is planned as: the kind the researcher found it to be
 * (`researched`, `pois.curated_category`), so a nightlife street open data files as a restaurant
 * takes an evening, not a meal. A researched `other` says only that no kind fits, so it never
 * replaces a kind open data knows (a museum, a park); then, and for a place loaded before the
 * researched kind was kept, the kind is read from its line: the researchers give every place to
 * eat a meal role, so a fado house, a tower or a market street that open data files as a restaurant is a
 * sight (a night out where they tagged it for nightlife, a market where they tagged it for
 * markets), and a puppet theatre or a cable car filed as a hotel or a station is a sight too. A
 * row without a line keeps its kind.
 */
export function curatedCategory(
  category: string,
  curated: CuratedNote | null,
  researched: string | null = null,
): string {
  if (curated === null) return category;
  if (researched !== null && researched !== 'other') return researched;
  if (curated.meal_role !== undefined) return NOT_SIGHTS.has(category) ? 'food' : category;
  if (!NOT_SIGHTS.has(category)) return category;
  const tags = curated.tags ?? [];
  if (tags.includes('nightlife')) return 'nightlife';
  if (tags.includes('markets')) return 'market';
  return 'other';
}

/** Itinerary pages that must include a place for it to count among what a town is known for. */
const WELL_BLOGGED = 3;

/**
 * Whether the researchers found the place among what people come for: one of a first visit's
 * essentials, an icon, or on three or more of the itinerary pages they read.
 */
export function curatedMustSee(curated: CuratedNote | null): boolean {
  if (curated === null) return false;
  return (
    curated.essential_rank !== undefined ||
    curated.prominence === 'icon' ||
    (curated.blog_count ?? 0) >= WELL_BLOGGED
  );
}
