/**
 * Joining the two sources: a GeoNames city joins its Wikidata item by QID (GeoNames `wkdt`) or
 * GeoNames id (Wikidata P1566), else by a shared folded name in the same country within 25 km. Then duplicates go: the same QID, or
 * the same folded name within 5 km, keeping the better-known row.
 */
import { foldedNames, haversineKm, type BaseCandidate } from './base-set';

export const JOIN_RADIUS_KM = 25;
export const DEDUPE_RADIUS_KM = 5;

/** The Wikidata row with the GeoNames row's ids, admin area, names and population added. */
function merge(item: BaseCandidate, city: BaseCandidate): BaseCandidate {
  return {
    ...item,
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
  return dedupe(joined);
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
