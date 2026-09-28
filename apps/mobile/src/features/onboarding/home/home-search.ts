/**
 * Home base search (3a-5) over the bundled airports. Results rank as: an exact IATA code, then
 * city or country name prefixes near the hint, then the hint's nearest airports by distance when
 * the query names the hint's own place, then other prefix hits, then weaker name matches. The
 * list stays short so the HOME stamp the pick inks shows below it.
 */
import {
  driveMinutesBetween,
  EXACT_CODE_SCORE,
  foldForSearch,
  hitIata,
  isFarFromAirports,
  nearestAirports,
  placeStartsWith,
  searchAirports,
  STRONG_MATCH_SCORE,
  type Airport,
  type AirportDataset,
  type AirportHit,
  type GeoHint,
  type MetroGroup,
  type NearbyAirport,
} from '@cp/domain';

export type HomeRow =
  | {
      readonly kind: 'airport';
      readonly airport: Airport;
      /** Drive time from the hint's point when it is another place; null otherwise. */
      readonly driveMinutes: number | null;
      readonly nearest: boolean;
    }
  | { readonly kind: 'metro'; readonly metro: MetroGroup };

export interface HomeResults {
  readonly rows: readonly HomeRow[];
  /** The nearest airport is further than a short drive ("Nearest is 3 h away"). */
  readonly farMinutes: number | null;
}

/** Rows the home screen shows: three leave room for the HOME stamp under them (3a-5). */
export const HOME_ROWS = 3;
const NEAREST_COUNT = 3;
/** Same-country airports this close read as home itself ("Singapore · SGD"), not a drive. */
const LOCAL_DRIVE_MINUTES = 60;

export function homeResults(
  dataset: AirportDataset,
  query: string,
  hint: GeoHint | null,
  limit = HOME_ROWS,
): HomeResults {
  const point = hint?.point ?? null;
  const nearest = point === null ? [] : nearestAirports(dataset.airports, point, NEAREST_COUNT);
  const nearIatas = new Set([...(hint?.nearest_iata ?? []), ...nearest.map((n) => n.airport.iata)]);
  const farMinutes = isFarFromAirports(nearest) ? (nearest[0]?.driveMinutes ?? null) : null;
  const airportRow = (airport: Airport): HomeRow => {
    const isNear = nearIatas.has(airport.iata);
    return {
      kind: 'airport',
      airport,
      driveMinutes: isNear ? driveFromHint(airport, hint) : null,
      nearest: isNear,
    };
  };

  if (query.trim().length === 0) {
    return { rows: nearest.slice(0, limit).map((n) => airportRow(n.airport)), farMinutes };
  }

  const hits = searchAirports(dataset, query, 40);
  const isLocal = (hit: AirportHit): boolean =>
    hint !== null &&
    (nearIatas.has(hitIata(hit)) || (hint.country !== null && hitCountry(hit) === hint.country));
  const exact = hits.filter((h) => h.score >= EXACT_CODE_SCORE);
  const strong = hits.filter((h) => h.score >= STRONG_MATCH_SCORE && h.score < EXACT_CODE_SCORE);
  const weak = hits.filter((h) => h.score < STRONG_MATCH_SCORE);
  const near = namesHintPlace(dataset, query, hint) ? nearest : [];

  const rows: HomeRow[] = [];
  const seen = new Set<string>();
  const push = (iata: string, row: () => HomeRow) => {
    if (seen.has(iata)) return;
    seen.add(iata);
    rows.push(row());
  };
  const pushHit = (hit: AirportHit) =>
    push(hitIata(hit), () =>
      hit.kind === 'metro' ? { kind: 'metro', metro: hit.metro } : airportRow(hit.airport),
    );
  const pushNear = (n: NearbyAirport) => push(n.airport.iata, () => airportRow(n.airport));

  exact.forEach(pushHit);
  strong.filter(isLocal).forEach(pushHit);
  near.forEach(pushNear);
  strong.filter((h) => !isLocal(h)).forEach(pushHit);
  weak.forEach(pushHit);
  return { rows: rows.slice(0, limit), farMinutes };
}

function hitCountry(hit: AirportHit): string {
  return hit.kind === 'metro' ? hit.metro.country : hit.airport.country;
}

/** The query starts the hint's own city or country ("Sing" typed in Singapore). */
function namesHintPlace(dataset: AirportDataset, query: string, hint: GeoHint | null): boolean {
  if (hint === null) return false;
  const q = foldForSearch(query);
  const country = hint.country === null ? undefined : dataset.countries[hint.country]?.name;
  return [hint.city, country].some((place) => place != null && placeStartsWith(place, q));
}

function driveFromHint(airport: Airport, hint: GeoHint | null): number | null {
  if (hint?.point == null) return null;
  if (hint.city != null && airport.city === hint.city) return null;
  const minutes = driveMinutesBetween(hint.point, airport);
  if (airport.country === hint.country && minutes <= LOCAL_DRIVE_MINUTES) return null;
  return minutes;
}
