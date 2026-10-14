/**
 * The home airport as the edit row shows it (9.02): "SIN · Changi". The airport's own name keeps
 * the row to one line: the city and the words "International Airport" fall away, and an airport
 * named only for its city reads as the city ("DAD · Da Nang").
 */
import { airportDataset } from '@cp/content/airports';

/** Words that name every airport, not this one. */
/* eslint-disable lingui/no-unlocalized-strings -- words matched in dataset names, never shown. */
const GENERIC = new Set([
  'international',
  'intl',
  'airport',
  'aeropuerto',
  'aéroport',
  'flughafen',
]);

/* eslint-enable lingui/no-unlocalized-strings */

export function shortAirportName(name: string, city: string): string {
  const cityWords = new Set(city.toLowerCase().split(/\s+/u));
  const own = name
    .split(/\s+/u)
    .filter((word) => {
      const lower = word.toLowerCase();
      return lower !== '' && !GENERIC.has(lower) && !cityWords.has(lower);
    })
    .join(' ');
  return own === '' ? city : own;
}

export function airportLabel(iata: string | null): string {
  if (iata === null) return '';
  const airport = airportDataset().airports.find((row) => row.iata === iata);
  return airport === undefined ? iata : `${iata} · ${shortAirportName(airport.name, airport.city)}`;
}
