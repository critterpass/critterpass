import type { SavedDay } from '@/data/trip-day/saved-days';

/**
 * Each area whose map a trip's saved days hold: a day's bundle carries the map of the area that
 * day is spent in, so two days in two areas hold two maps (told apart by the file they saved).
 * `areaOfDate` names the area of a day trip's date; every other day's map is the city's.
 */
export function savedMapAreas(
  days: readonly Pick<SavedDay, 'localDate' | 'assets'>[],
  city: string,
  areaOfDate: ReadonlyMap<string, string>,
): string[] {
  const byMap = new Map<string, string>();
  for (const day of [...days].sort((a, b) => a.localDate.localeCompare(b.localDate))) {
    const map = day.assets.find((asset) => asset.kind === 'map_region');
    if (map === undefined || byMap.has(map.key)) continue;
    byMap.set(map.key, areaOfDate.get(day.localDate) ?? city);
  }
  const names = [...new Set(byMap.values())].filter((name) => name !== '');
  if (names.every((name) => name === city)) return [];
  return [...names.filter((name) => name === city), ...names.filter((name) => name !== city)];
}
