/**
 * The bundled home-airport dataset (3a-5, 3n-3): offline search runs over it, the api validates
 * `set_home_airport` against it and derives the home country and currency from it.
 */
import type { AirportDataset, MetroGroup } from '@cp/domain';

import airportsFile from './airports.json';
import metroGroups from './metro-groups.json';
import { airportDatasetFromTrustedFile, type AirportsFile } from './schema';

export * from './schema';

const metros: readonly MetroGroup[] = metroGroups;
let dataset: AirportDataset | null = null;

/** Built once on first use: the file is large and most launches never search airports. */
export function airportDataset(): AirportDataset {
  // JSON imports widen tuples to arrays; the rows were validated when the file was built.
  dataset ??= airportDatasetFromTrustedFile(airportsFile as unknown as AirportsFile, metros);
  return dataset;
}
