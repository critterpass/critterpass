/**
 * Joining the two sources: a GeoNames city joins its Wikidata item by QID (GeoNames `wkdt`) or
 * GeoNames id (Wikidata P1566), else by a shared folded name in the same country within 40 km (an
 * item for a city-province such as Cần Thơ sits on the province's centroid, 34 km from the city).
 * Then duplicates go: the same QID, or the same folded name within 5 km, keeping the better-known
 * row. Last, a GeoNames city without a Wikivoyage article within 15 km of a city of its country
 * with at least twice its population is a part of that city (Hanoi's Cầu Giấy, Saigon's Quận Mười, Barcelona's
 * L'Hospitalet) and goes.
 */
import { foldedNames, haversineKm, type BaseCandidate } from './base-set';

export const JOIN_RADIUS_KM = 40;
export const DEDUPE_RADIUS_KM = 5;
export const CITY_PART_RADIUS_KM = 15;

/**
 * The Wikidata row with the GeoNames row's ids, admin area, names and population added. When the
 * item's point is more than 5 km off the city's, it is an area's centroid and the city's point wins.
 */
function merge(item: BaseCandidate, city: BaseCandidate): BaseCandidate {
  const centroid = haversineKm(item.lat, item.lng, city.lat, city.lng) > DEDUPE_RADIUS_KM;
  return {
    ...item,
    ...(centroid ? { lat: city.lat, lng: city.lng } : {}),
    geonamesId: city.geonamesId,
    admin1: item.admin1 ?? city.admin1,
    names: { ...city.names, ...item.names },
    population: item.population ?? city.population,
    elevationM: item.elevationM ?? city.elevationM ?? null,
    tz: item.tz ?? city.tz ?? null,
  };
}

export function joinSources(
  items: readonly BaseCandidate[],
  cities: readonly BaseCandidate[],
): BaseCandidate[] {
  const joined = [...items];
  const byQid = new Map<string, number>();
  const byGeonames = new Map<number, number>();
  const byName = new Map<string, number[]>();
  joined.forEach((item, i) => {
    if (item.qid !== null) byQid.set(item.qid, i);
    if (item.geonamesId !== null) byGeonames.set(item.geonamesId, i);
    for (const name of foldedNames(item)) {
      const key = `${item.countryCode}|${name}`;
      byName.set(key, [...(byName.get(key) ?? []), i]);
    }
  });
  const taken = new Set<number>();
  for (const city of cities) {
    let at =
      (city.qid === null ? undefined : byQid.get(city.qid)) ??
      (city.geonamesId === null ? undefined : byGeonames.get(city.geonamesId));
    if (at !== undefined && taken.has(at)) at = undefined;
    if (at === undefined) {
      let best = JOIN_RADIUS_KM;
      for (const name of foldedNames(city)) {
        for (const i of byName.get(`${city.countryCode}|${name}`) ?? []) {
          const item = joined[i];
          if (item === undefined || taken.has(i)) continue;
          const km = haversineKm(item.lat, item.lng, city.lat, city.lng);
          if (km <= best) {
            best = km;
            at = i;
          }
        }
      }
    }
    const item = at === undefined ? undefined : joined[at];
    if (at !== undefined && item !== undefined) {
      taken.add(at);
      joined[at] = merge(item, city);
    } else {
      joined.push(city);
    }
  }
  return dropCityParts(dedupe(joined));
}

const hasArticle = (c: BaseCandidate) => (c.wikivoyage ?? 0) > 0;

/**
 * Drops each row without a Wikivoyage article that lies within 15 km of a city at least twice its
 * population.
 */
export function dropCityParts(candidates: readonly BaseCandidate[]): BaseCandidate[] {
  // A grid of 0.2° cells (about 22 km of latitude): a neighbour is in the 3×3 cells around a row.
  const cell = (lat: number, lng: number) => `${Math.floor(lat / 0.2)}|${Math.floor(lng / 0.2)}`;
  const grid = new Map<string, BaseCandidate[]>();
  for (const row of candidates) {
    const key = cell(row.lat, row.lng);
    grid.set(key, [...(grid.get(key) ?? []), row]);
  }
  const isPart = (row: BaseCandidate) => {
    if (hasArticle(row)) return false;
    const [y, x] = [Math.floor(row.lat / 0.2), Math.floor(row.lng / 0.2)];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const other of grid.get(`${String(y + dy)}|${String(x + dx)}`) ?? []) {
          if (
            other !== row &&
            other.kind === 'city' &&
            other.countryCode === row.countryCode &&
            (other.population ?? 0) >= 2 * (row.population ?? 0) &&
            haversineKm(other.lat, other.lng, row.lat, row.lng) <= CITY_PART_RADIUS_KM
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };
  return candidates.filter((row) => !isPart(row));
}

const knownness = (c: BaseCandidate) => c.sitelinks * 1e9 + (c.population ?? 0);

export function dedupe(candidates: readonly BaseCandidate[]): BaseCandidate[] {
  const sorted = [...candidates].sort((a, b) => knownness(b) - knownness(a));
  const kept: BaseCandidate[] = [];
  const qids = new Set<string>();
  const geonames = new Set<number>();
  const byName = new Map<string, BaseCandidate[]>();
  for (const candidate of sorted) {
    if (candidate.qid !== null && qids.has(candidate.qid)) continue;
    if (candidate.geonamesId !== null && geonames.has(candidate.geonamesId)) continue;
    const keys = [...foldedNames(candidate)].map((name) => `${candidate.countryCode}|${name}`);
    const near = keys.some((key) =>
      (byName.get(key) ?? []).some(
        (other) =>
          haversineKm(other.lat, other.lng, candidate.lat, candidate.lng) <= DEDUPE_RADIUS_KM,
      ),
    );
    if (near) continue;
    kept.push(candidate);
    if (candidate.qid !== null) qids.add(candidate.qid);
    if (candidate.geonamesId !== null) geonames.add(candidate.geonamesId);
    for (const key of keys) byName.set(key, [...(byName.get(key) ?? []), candidate]);
  }
  return kept;
}
