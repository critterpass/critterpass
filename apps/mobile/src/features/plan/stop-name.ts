/**
 * How a plan stop is named, everywhere the plan shows one (the day view, the overview, review):
 * its place's name from the plan version's own record first (a drafted stop's place is often not
 * in the phone's place catalogue), then the catalogue's, then its booking's title, then its kind.
 * The guide's note is a sentence about the stop and is never its name; only a person's own stop
 * with no place goes by what they typed.
 */
import { t } from '@lingui/core/macro';

/** The plan version's own place names, by place id (`itinerary_versions.coverage.places`). */
export function placeNamesOf(coverage: string | null): ReadonlyMap<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(coverage ?? 'null') as unknown;
  } catch {
    return new Map();
  }
  const places = (parsed as { places?: unknown } | null)?.places;
  if (typeof places !== 'object' || places === null) return new Map();
  return new Map(
    Object.entries(places as Record<string, unknown>).flatMap(([id, place]) => {
      const name = (place as { name?: unknown } | null)?.name;
      return typeof name === 'string' && name.trim() !== '' ? [[id, name.trim()] as const] : [];
    }),
  );
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
  readonly booking_title?: string | null;
  readonly notes: string | null;
  readonly category: string | null;
  readonly created_by_kind: string | null;
}

/** The stop's name, in the order above. */
export function stopName(stop: NamedStop, places: ReadonlyMap<string, string>): string {
  const own = stop.poi_id === null ? undefined : places.get(stop.poi_id);
  const named = own ?? stop.poi_name ?? stop.booking_title ?? null;
  if (named !== null && named.trim() !== '') return named;
  if (stop.poi_id === null && stop.created_by_kind !== 'guide' && stop.notes?.trim()) {
    return stop.notes.trim();
  }
  return kindTitle(stop.category);
}
