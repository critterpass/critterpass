/**
 * How a home-base result reads, shared by the current and the premium page: its code, its title
 * (a metro is "All {city} airports"), and its facts (country, then the currency or the drive).
 */
import { t } from '@lingui/core/macro';

import { airportDataset } from '../content';
import { regionName } from '../region-names';
import type { HomeRow } from './home-search';

export function countryName(country: string, locale: string): string {
  return regionName(country, locale) ?? airportDataset().countries[country]?.name ?? country;
}

export function driveLabel(minutes: number): string {
  if (minutes < 90) return t({ id: 'onboarding.home.minutesAway', message: `${minutes} min away` });
  const hours = Math.round(minutes / 60);
  return t({ id: 'onboarding.home.hoursAway', message: `${hours} h away` });
}

export function rowKey(row: HomeRow): string {
  return row.kind === 'metro' ? row.metro.iata : row.airport.iata;
}

export function rowTitle(row: HomeRow): string {
  return row.kind === 'metro'
    ? t({ id: 'onboarding.home.metro', message: `All ${row.metro.city} airports` })
    : row.airport.name.replace(/ (International )?Airport$/u, '');
}

export function rowFacts(row: HomeRow, locale: string): string {
  const country = row.kind === 'metro' ? row.metro.country : row.airport.country;
  const currency = airportDataset().countries[country]?.currency;
  return row.kind === 'airport' && row.driveMinutes !== null
    ? `${countryName(country, locale)} · ${driveLabel(row.driveMinutes)}`
    : [countryName(country, locale), currency].filter(Boolean).join(' · ');
}
