/**
 * Home base search (3a-5) over the bundled airports: results per keystroke, the IP hint's nearest
 * airports on top when there is no query, and the row facts each row prints.
 */
import {
  driveMinutesBetween,
  hitIata,
  isFarFromAirports,
  nearestAirports,
  searchAirports,
  type Airport,
  type AirportDataset,
  type GeoHint,
  type MetroGroup,
} from '@cp/domain';

export type HomeRow =
  | {
      readonly kind: 'airport';
      readonly airport: Airport;
      /** Drive time from the hint's city when it is a different place; null otherwise. */
      readonly driveMinutes: number | null;
      readonly nearest: boolean;
    }
  | { readonly kind: 'metro'; readonly metro: MetroGroup };

export interface HomeResults {
  readonly rows: readonly HomeRow[];
  /** The nearest airport is further than a short drive ("Nearest is 3 h away"). */
  readonly farMinutes: number | null;
}

const NEAREST_COUNT = 3;

export function homeResults(
  dataset: AirportDataset,
  query: string,
  hint: GeoHint | null,
): HomeResults {
  const point = hint?.point ?? null;
  const nearest = point === null ? [] : nearestAirports(dataset.airports, point, NEAREST_COUNT);
  const nearestIatas = new Set([
    ...(hint?.nearest_iata ?? []),
    ...nearest.map((n) => n.airport.iata),
  ]);
  const driveOf = (airport: Airport): number | null => {
    if (point === null) return null;
    if (hint?.city != null && airport.city === hint.city) return null;
    return driveMinutesBetween(point, airport);
  };
  const farMinutes = isFarFromAirports(nearest) ? (nearest[0]?.driveMinutes ?? null) : null;

  if (query.trim().length === 0) {
    return {
      rows: nearest.map((n) => ({
        kind: 'airport' as const,
        airport: n.airport,
        driveMinutes: driveOf(n.airport),
        nearest: true,
      })),
      farMinutes,
    };
  }
  const hits = searchAirports(dataset, query);
  // Nearest airports that match the query rise above the rest (3a-5: "nearest on top").
  const ordered = [
    ...hits.filter((h) => nearestIatas.has(hitIata(h))),
    ...hits.filter((h) => !nearestIatas.has(hitIata(h))),
  ];
  return {
    rows: ordered.map((hit) =>
      hit.kind === 'metro'
        ? { kind: 'metro' as const, metro: hit.metro }
        : {
            kind: 'airport' as const,
            airport: hit.airport,
            driveMinutes: nearestIatas.has(hit.airport.iata) ? driveOf(hit.airport) : null,
            nearest: nearestIatas.has(hit.airport.iata),
          },
    ),
    farMinutes,
  };
}
