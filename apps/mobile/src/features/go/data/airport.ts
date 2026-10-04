/* eslint-disable lingui/no-unlocalized-strings -- airport codes and proper names, never copy. */
/** An airport by IATA code from the bundled airport list (OurAirports), for a flight's GO. */
import { airportDataset } from '@cp/content/airports';

import type { AirportLookup } from './go-place';

/**
 * Vietnam's airports as people there write them: the bundled list has no diacritics. The button
 * names the airport by these in every language; any other airport keeps the list's city.
 */
const VIETNAM_AIRPORT_NAMES: Readonly<Record<string, string>> = {
  DAD: 'Đà Nẵng',
  SGN: 'Tân Sơn Nhất',
  HAN: 'Nội Bài',
  PQC: 'Phú Quốc',
  CXR: 'Cam Ranh',
  HPH: 'Cát Bi',
  HUI: 'Phú Bài',
  DLI: 'Liên Khương',
  VDO: 'Vân Đồn',
};

export const bundledAirportAt: AirportLookup = (iata) => {
  const code = iata.trim().toUpperCase();
  const airport = airportDataset().airports.find((row) => row.iata === code);
  return airport === undefined
    ? null
    : {
        iata: airport.iata,
        name: airport.name,
        city: VIETNAM_AIRPORT_NAMES[airport.iata] ?? airport.city,
        lat: airport.lat,
        lng: airport.lng,
      };
};
