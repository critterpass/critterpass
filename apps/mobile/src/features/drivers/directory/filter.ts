/**
 * The directory's filters (6e-1), run on the phone over the last answer so they work offline: an
 * area chip, a language, 7+ seats and day trips. The api's order is kept; when an area has nobody,
 * the nearest listed areas to widen to are the most-listed others.
 */
import type { DriverDirectoryCard } from '@cp/domain';

export interface DirectoryFilters {
  readonly areas: readonly string[];
  readonly language: string | null;
  readonly sevenPlus: boolean;
  readonly dayTrips: boolean;
}

export const NO_FILTERS: DirectoryFilters = {
  areas: [],
  language: null,
  sevenPlus: false,
  dayTrips: false,
};

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

export function filterDirectory(
  drivers: readonly DriverDirectoryCard[],
  filters: DirectoryFilters,
): DriverDirectoryCard[] {
  return drivers.filter((driver) => {
    if (
      filters.areas.length > 0 &&
      !filters.areas.some((area) => driver.areas.some((a) => same(a, area)))
    ) {
      return false;
    }
    if (
      filters.language !== null &&
      !driver.languages.some((language) =>
        language.toLowerCase().startsWith((filters.language ?? '').toLowerCase()),
      )
    ) {
      return false;
    }
    if (filters.sevenPlus && (driver.seats ?? driver.vehicle?.seats ?? 0) < 7) return false;
    if (filters.dayTrips && !driver.day_trips) return false;
    return true;
  });
}

/** Areas other drivers cover, most-listed first, for "Show {area} too". */
export function nearbyAreas(
  drivers: readonly DriverDirectoryCard[],
  exclude: readonly string[],
  limit = 3,
): string[] {
  const counts = new Map<string, { area: string; drivers: number }>();
  for (const driver of drivers) {
    for (const area of driver.areas) {
      if (exclude.some((excluded) => same(excluded, area))) continue;
      const key = area.toLowerCase();
      const entry = counts.get(key) ?? { area, drivers: 0 };
      counts.set(key, { area: entry.area, drivers: entry.drivers + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.drivers - a.drivers || a.area.localeCompare(b.area))
    .slice(0, limit)
    .map((entry) => entry.area);
}

/** The area chips: the trip's own area first, then the most-listed areas. */
export function areaChips(
  drivers: readonly DriverDirectoryCard[],
  home: string | null,
  limit = 4,
): string[] {
  const chips = home === null ? [] : [home];
  for (const area of nearbyAreas(drivers, chips, limit)) chips.push(area);
  return chips.slice(0, limit);
}
