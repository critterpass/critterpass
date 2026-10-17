/**
 * How far itinerary pages agree on a place. A first visit is built around some places (the
 * destination's essentials, and the stops of the days most pages lay out the same way), three or
 * more pages hold others (or they are an icon of the town), and the rest are what one page or a
 * local likes. Meals and the stops that give way to them are ranked by it before their area: a
 * newer local favourite takes a seat only where no place the pages agree on fits the day's area and
 * time. Among places pages agree on alike (or both not), the one that suits the crew's tastes wins
 * before area or list order; an evening, the crew's own time, puts the crew's tastes first.
 *
 * A must-see that is neither an essential nor on the pages' days and that suits none of a crew's
 * tastes may give way to a place pages agree on at least as much that does (`mustSeeYieldsTo`):
 * one on the pages' days, or held by three or more pages and by no fewer than the must-see. A crew
 * with no tastes keeps every must-see.
 */
import { tasteScore, type DraftPoi } from '@cp/planner';

import type { DraftPlanInput } from './context';

/** 0: a first visit is built around it; 1: three or more pages hold it; 2: neither. */
export type Agreement = 0 | 1 | 2;

/** Pages that must hold a place for it to count as agreed on. */
const AGREED_PAGES = 3;

const ON_PAGES_DAYS = new WeakMap<object, ReadonlySet<string>>();

/** Our places on the days itinerary pages lay out for a first visit. */
function onPagesDays(input: Pick<DraftPlanInput, 'firstVisit'>): ReadonlySet<string> {
  const visit = input.firstVisit;
  if (visit === undefined) return new Set();
  const known = ON_PAGES_DAYS.get(visit);
  if (known !== undefined) return known;
  const ids = new Set(visit.days.flatMap((day) => day.stops.flatMap((stop) => stop.poiId ?? [])));
  ON_PAGES_DAYS.set(visit, ids);
  return ids;
}

export function agreementOf(input: Pick<DraftPlanInput, 'firstVisit'>, poi: DraftPoi): Agreement {
  if (poi.essential === true || poi.essentialRank != null || onPagesDays(input).has(poi.id)) {
    return 0;
  }
  return poi.mustSee || poi.prominence === 'icon' || (poi.blogCount ?? 0) >= AGREED_PAGES ? 1 : 2;
}

type CrewInput = Pick<DraftPlanInput, 'firstVisit' | 'tastes'>;

/** Whether `poi` is a must-see that may give way for this crew (see the file note). */
export function mustSeeYields(input: CrewInput, poi: DraftPoi): boolean {
  return (
    poi.mustSee &&
    Object.keys(input.tastes).length > 0 &&
    agreementOf(input, poi) === 1 &&
    tasteScore(poi, input.tastes) <= 0
  );
}

/** Whether a must-see may give way to `poi`: one pages agree on that suits the crew. */
export function earnsYield(input: CrewInput, poi: DraftPoi): boolean {
  return (
    tasteScore(poi, input.tastes) > 0 &&
    (agreementOf(input, poi) === 0 || (poi.blogCount ?? 0) >= AGREED_PAGES)
  );
}

/** Whether the must-see `held` may give way to `incoming` for this crew (see the file note). */
export function mustSeeYieldsTo(input: CrewInput, held: DraftPoi, incoming: DraftPoi): boolean {
  return (
    mustSeeYields(input, held) &&
    earnsYield(input, incoming) &&
    (agreementOf(input, incoming) === 0 || (incoming.blogCount ?? 0) >= (held.blogCount ?? 0))
  );
}

/** Whether itinerary pages agree on the place (see the file note). */
export function isAgreed(input: Pick<DraftPlanInput, 'firstVisit'>, poi: DraftPoi): boolean {
  return agreementOf(input, poi) < 2;
}

/** How far pages agree on a stop's place (a stop without a known place: not at all). */
export function agreementOfStop(
  input: Pick<DraftPlanInput, 'firstVisit' | 'pois'>,
  item: { readonly poi_id: string | null },
): Agreement {
  const poi = input.pois.get(item.poi_id ?? '');
  return poi === undefined ? 2 : agreementOf(input, poi);
}

/**
 * Where a place stands among equally near ones: those pages agree on first, and among places
 * pages agree on alike, those that suit the crew's tastes first (0 best, 3 last).
 */
export function agreedThenSuits(
  input: Pick<DraftPlanInput, 'firstVisit' | 'tastes'>,
): (poi: DraftPoi) => number {
  return (poi) =>
    2 * Math.min(agreementOf(input, poi), 1) + (tasteScore(poi, input.tastes) > 0 ? 0 : 1);
}
