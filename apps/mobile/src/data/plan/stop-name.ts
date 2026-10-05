/**
 * How a plan stop is named, everywhere the plan shows one (the day view, the overview, review, the
 * day-of screen): a place the catalogue names in two languages by the shared rule (`@cp/domain`
 * `shownName`, the reader's language where it is the destination's); otherwise the plan version's
 * own record of it (a drafted stop's place is often not in the catalogue), then the catalogue's,
 * then its booking's title, then its kind.
 * The guide's note is a sentence about the stop and is never its name; only a person's own stop
 * with no place goes by what they typed.
 */
import { shownName } from '@cp/domain';
import { t } from '@lingui/core/macro';

function parse(json: string | null | undefined): unknown {
  try {
    return JSON.parse(json ?? 'null') as unknown;
  } catch {
    return null;
  }
}

function named(entries: [string, unknown][]): [string, string][] {
  return entries.flatMap(([id, name]) =>
    typeof name === 'string' && name.trim() !== '' ? [[id, name.trim()] as [string, string]] : [],
  );
}

/**
 * The plan version's own place names, by place id (`itinerary_versions.coverage.places`), with the
 * names of places this phone picked in the add sheet (`picked`, id → name) behind them: a place
 * found on the server is never in the phone's catalogue, and the plan's record of it arrives with
 * the next version.
 */
export function placeNamesOf(
  coverage: string | null,
  picked?: string | null,
): ReadonlyMap<string, string> {
  const places = (parse(coverage) as { places?: unknown } | null)?.places;
  const own =
    typeof places === 'object' && places !== null
      ? named(
          Object.entries(places as Record<string, unknown>).map(([id, place]) => [
            id,
            (place as { name?: unknown } | null)?.name,
          ]),
        )
      : [];
  const local = parse(picked);
  const fromPhone = typeof local === 'object' && local !== null ? named(Object.entries(local)) : [];
  return new Map([...fromPhone, ...own]);
}

/** A stop's kind as a name, for a stop with nothing better to go by. */
export function kindTitle(category: string | null | undefined): string {
  return category === 'meal' || category === 'food'
    ? t({ id: 'plan.day.item.kindMeal', message: 'Meal' })
    : t({ id: 'plan.day.item.kindActivity', message: 'Activity' });
}

export interface NamedStop {
  readonly poi_id: string | null;
  readonly poi_name: string | null;
  readonly poi_name_local?: string | null;
  readonly booking_title?: string | null;
  readonly notes: string | null;
  readonly category: string | null;
  readonly created_by_kind: string | null;
}

/** The stop's name, in the order above. */
export function stopName(
  stop: NamedStop,
  places: ReadonlyMap<string, string>,
  /** The reader sees the destination's own names (`useReadsLocalNames`). */
  readsLocal = false,
): string {
  // A place the catalogue holds in two languages is named by the shared rule; otherwise the plan
  // version's own record of it comes first, as before (a drafted stop's place is often not in
  // the catalogue, and the planner already named it for the organiser).
  const local = stop.poi_name_local?.trim() ?? '';
  const both =
    stop.poi_name === null || stop.poi_name.trim() === '' || local === ''
      ? null
      : shownName({ name: stop.poi_name, nameLocal: local }, readsLocal);
  const own = stop.poi_id === null ? undefined : places.get(stop.poi_id);
  const named = both ?? own ?? stop.poi_name ?? stop.booking_title ?? null;
  if (named !== null && named.trim() !== '') return named;
  if (stop.poi_id === null && stop.created_by_kind !== 'guide' && stop.notes?.trim()) {
    return stop.notes.trim();
  }
  return kindTitle(stop.category);
}
