/**
 * Builds packages/content/airports/airports.json from OurAirports (public domain): airports with
 * scheduled service and an IATA code (large, medium and small; heliports and seaplane bases left
 * out), each country's ISO alpha-3 and name from the datasets/country-codes table, and the home
 * currency from @cp/cost-engine so money and the profile agree on it, and each airport's IANA time
 * zone from its coordinates (`geo-tz`, MIT, the timezone-boundary-builder polygons, offline; a
 * build-time dependency only).
 *
 *   pnpm tsx tools/scripts/build-airports.ts           download, filter, write
 *   pnpm tsx tools/scripts/build-airports.ts --zones   recompute the zones of the committed rows
 *   pnpm tsx tools/scripts/build-airports.ts --check   validate the committed file (no network)
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  AIRPORTS_FILE_BUDGET_BYTES,
  parseAirportDataset,
  type AirportsFile,
} from '@cp/content/airports/schema';
import { COUNTRY_CURRENCIES } from '@cp/cost-engine';
import { canonicalTz } from '@cp/domain';
import { find as zonesAt } from 'geo-tz/all';

const DIR = path.resolve(import.meta.dirname, '../../packages/content/airports');
export const AIRPORTS_PATH = path.join(DIR, 'airports.json');
const METROS_PATH = path.join(DIR, 'metro-groups.json');

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const COUNTRIES_URL =
  'https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv';

const RANK_BY_TYPE: Readonly<Record<string, 1 | 2 | 3>> = {
  large_airport: 1,
  medium_airport: 2,
  small_airport: 3,
};

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) rows.push([...row, field]);
  const [header, ...body] = rows;
  if (header === undefined) return [];
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((key, index) => [key, r[index] ?? ''])));
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** The canonical IANA zone at an airport's coordinates. */
export function zoneAt(lat: number, lng: number): string {
  const zone = zonesAt(lat, lng)[0];
  if (zone === undefined) throw new Error(`no time zone at ${lat}, ${lng}`);
  return canonicalTz(zone);
}

type AirportRow = AirportsFile['airports'][number];

/** A committed row (with or without its zone) with the zone recomputed from its coordinates. */
export function withZone(row: readonly [...Readonly<AirportRow>] | readonly unknown[]): AirportRow {
  const [iata, name, city, country, lat, lng, rank] = row as AirportRow;
  return [iata, name, city, country, lat, lng, rank, zoneAt(lat, lng)];
}

export function buildAirportsFile(
  airportsCsv: string,
  countriesCsv: string,
  builtAt: string,
): AirportsFile {
  const countryRows = parseCsv(countriesCsv);
  const facts = new Map<string, { iso3: string; name: string; currency: string | null }>();
  for (const row of countryRows) {
    const iso2 = row['ISO3166-1-Alpha-2'] ?? '';
    const iso3 = row['ISO3166-1-Alpha-3'] ?? '';
    if (!/^[A-Z]{2}$/u.test(iso2) || !/^[A-Z]{3}$/u.test(iso3)) continue;
    const name = row['CLDR display name'] || row['official_name_en'] || iso2;
    const fallback = row['ISO4217-currency_alphabetic_code']?.split(',')[0] ?? '';
    const currency = COUNTRY_CURRENCIES[iso2] ?? (/^[A-Z]{3}$/u.test(fallback) ? fallback : null);
    facts.set(iso2, { iso3, name, currency });
  }
  // Kosovo has a user-assigned code in ISO 3166 and is missing from the table.
  if (!facts.has('XK')) facts.set('XK', { iso3: 'XKX', name: 'Kosovo', currency: 'EUR' });

  const seen = new Set<string>();
  const airports: AirportsFile['airports'] = [];
  for (const row of parseCsv(airportsCsv)) {
    const iata = row['iata_code'] ?? '';
    const rank = RANK_BY_TYPE[row['type'] ?? ''];
    const country = row['iso_country'] ?? '';
    if (row['scheduled_service'] !== 'yes' || rank === undefined) continue;
    if (!/^[A-Z]{3}$/u.test(iata) || seen.has(iata) || !facts.has(country)) continue;
    seen.add(iata);
    const lat = round(Number(row['latitude_deg']));
    const lng = round(Number(row['longitude_deg']));
    airports.push([
      iata,
      (row['name'] ?? '').slice(0, 120),
      (row['municipality'] ?? '').slice(0, 80),
      country,
      lat,
      lng,
      rank,
      zoneAt(lat, lng),
    ]);
  }
  airports.sort((a, b) => a[0].localeCompare(b[0]));
  const used = new Set(airports.map((a) => a[3]));
  const countries = Object.fromEntries(
    [...facts.entries()]
      .filter(([iso2]) => used.has(iso2))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso2, fact]) => [iso2, fact]),
  );
  return { source: 'OurAirports (public domain)', built_at: builtAt, countries, airports };
}

/** Compact but diffable: one airport per line. */
export function serializeAirportsFile(file: AirportsFile): string {
  const head = JSON.stringify({ source: file.source, built_at: file.built_at });
  const countries = Object.entries(file.countries)
    .map(([iso2, fact]) => `    ${JSON.stringify(iso2)}: ${JSON.stringify(fact)}`)
    .join(',\n');
  const airports = file.airports.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  return `${head.slice(0, -1)},\n  "countries": {\n${countries}\n  },\n  "airports": [\n${airports}\n  ]\n}\n`;
}

export function checkAirports(): { airports: number; bytes: number } {
  const bytes = statSync(AIRPORTS_PATH).size;
  if (bytes > AIRPORTS_FILE_BUDGET_BYTES) {
    throw new Error(
      `airports.json is ${bytes} bytes, over the ${AIRPORTS_FILE_BUDGET_BYTES} budget`,
    );
  }
  const dataset = parseAirportDataset(
    JSON.parse(readFileSync(AIRPORTS_PATH, 'utf8')),
    JSON.parse(readFileSync(METROS_PATH, 'utf8')),
  );
  return { airports: dataset.airports.length, bytes };
}

async function download(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function main(): Promise<void> {
  if (process.argv.includes('--zones')) {
    const file = JSON.parse(readFileSync(AIRPORTS_PATH, 'utf8')) as AirportsFile;
    writeFileSync(
      AIRPORTS_PATH,
      serializeAirportsFile({ ...file, airports: file.airports.map(withZone) }),
    );
  } else if (!process.argv.includes('--check')) {
    const [airportsCsv, countriesCsv] = await Promise.all([
      download(AIRPORTS_URL),
      download(COUNTRIES_URL),
    ]);
    const file = buildAirportsFile(
      airportsCsv,
      countriesCsv,
      new Date().toISOString().slice(0, 10),
    );
    writeFileSync(AIRPORTS_PATH, serializeAirportsFile(file));
  }
  const { airports, bytes } = checkAirports();
  console.log(`airports.json: ${airports} airports, ${Math.round(bytes / 1024)} KB`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
