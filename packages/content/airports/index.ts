/**
 * The bundled home-airport dataset (3a-5, 3n-3): offline search runs over it, the api validates
 * `set_home_airport` against it and derives the home country and currency from it, and a flight's
 * times are read in its airports' own time zones.
 */
import type { AirportDataset, MetroGroup } from '@cp/domain';

import airportsFile from './airports.json';
import metroGroups from './metro-groups.json';
import {
  airportDatasetFromTrustedFile,
  airportZonesFromTrustedFile,
  type AirportsFile,
} from './schema';

export * from './schema';

const metros: readonly MetroGroup[] = metroGroups;
let dataset: AirportDataset | null = null;
let zones: ReadonlyMap<string, string> | null = null;

/** Built once on first use: the file is large and most launches never search airports. */
export function airportDataset(): AirportDataset {
  // JSON imports widen tuples to arrays; the rows were validated when the file was built.
  dataset ??= airportDatasetFromTrustedFile(airportsFile as unknown as AirportsFile, metros);
  return dataset;
}

/** The IANA time zone of the airport `iata` ("DAD" → "Asia/Ho_Chi_Minh"), or null when unknown. */
export function airportZone(iata: string): string | null {
  zones ??= airportZonesFromTrustedFile(airportsFile as unknown as AirportsFile);
  return zones.get(iata.trim().toUpperCase()) ?? null;
}
