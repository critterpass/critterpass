/** An airport by IATA code from the bundled airport list (OurAirports), for a flight's GO. */
import { airportDataset } from '@cp/content/airports';

import type { AirportLookup } from './go-place';

export const bundledAirportAt: AirportLookup = (iata) => {
  const code = iata.trim().toUpperCase();
  const airport = airportDataset().airports.find((row) => row.iata === code);
  return airport === undefined ? null : { name: airport.name, lat: airport.lat, lng: airport.lng };
};
