/**
 * The bundled airport dataset file (`airports.json`, written by tools/scripts/build-airports.ts
 * from OurAirports, public domain) and the hand-kept metro groups. Rows are tuples to keep the
 * app bundle small; `parseAirportDataset` turns them into the domain's `AirportDataset`.
 */
import {
  airportCountrySchema,
  airportRankSchema,
  airportSchema,
  iataSchema,
  metroGroupSchema,
  type Airport,
  type AirportDataset,
} from '@cp/domain';
import { z } from 'zod';

/** [iata, name, city, country, lat, lng, rank] */
export const airportRowSchema = z.tuple([
  iataSchema,
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.number(),
  airportRankSchema,
]);

export const airportsFileSchema = z
  .object({
    source: z.string().min(1),
    built_at: z.iso.date(),
    countries: z.record(z.string().regex(/^[A-Z]{2}$/u), airportCountrySchema),
    airports: z.array(airportRowSchema).min(1),
  })
  .strict();
export type AirportsFile = z.infer<typeof airportsFileSchema>;

export const metroGroupsFileSchema = z.array(metroGroupSchema);

/** Upper bound on the bundled file, so the dataset never quietly bloats the app. */
export const AIRPORTS_FILE_BUDGET_BYTES = 600 * 1024;

function rowToAirport([iata, name, city, country, lat, lng, rank]: z.infer<
  typeof airportRowSchema
>): Airport {
  return { iata, name, city, country, lat, lng, rank };
}

/** Full validation: every row, every country reference, every metro member. */
export function parseAirportDataset(file: unknown, metros: unknown): AirportDataset {
  const parsed = airportsFileSchema.parse(file);
  const airports = parsed.airports.map((row) => airportSchema.parse(rowToAirport(row)));
  const known = new Set(airports.map((a) => a.iata));
  const groups = metroGroupsFileSchema.parse(metros);
  for (const airport of airports) {
    if (parsed.countries[airport.country] === undefined) {
      throw new Error(`airport ${airport.iata}: no country facts for ${airport.country}`);
    }
  }
  for (const group of groups) {
    if (known.has(group.iata)) throw new Error(`metro ${group.iata} clashes with an airport`);
    const missing = group.airports.filter((iata) => !known.has(iata));
    if (missing.length > 0) throw new Error(`metro ${group.iata}: unknown ${missing.join(', ')}`);
  }
  return { airports, countries: parsed.countries, metros: groups };
}

/**
 * The app's fast path: the file is validated in CI (`parseAirportDataset` in this package's tests
 * and `build-airports.ts --check`), so at runtime rows are only reshaped, never re-parsed.
 */
export function airportDatasetFromTrustedFile(
  file: AirportsFile,
  metros: AirportDataset['metros'],
): AirportDataset {
  return { airports: file.airports.map(rowToAirport), countries: file.countries, metros };
}
