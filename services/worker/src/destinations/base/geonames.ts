/**
 * GeoNames (CC BY 4.0, https://www.geonames.org/export/): the cities files, country names and
 * currencies, first-level region names, and Vietnam's alternate names (its Vietnamese spellings and
 * Wikidata ids). Downloaded per build; parsed into base-set candidates.
 */
import { inflateRawSync } from 'node:zlib';

import type { BaseCandidate } from '@cp/domain';

export const GEONAMES_BASE_URL = 'https://download.geonames.org/export/dump/';
const USER_AGENT = 'CritterPass-destinations/1.0 (https://critterpass.app)';

/** The one named entry of a zip archive (stored or deflated), read from its central directory. */
export function unzipEntry(zip: Uint8Array, name: string): string {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip archive');
  let at = buf.readUInt32LE(eocd + 16);
  const entries = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < entries; i += 1) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const entryName = buf.toString('utf8', at + 46, at + 46 + nameLength);
    if (entryName === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    at += 46 + nameLength + extra + comment;
  }
  throw new Error(`zip has no ${name}`);
}

export interface CountryInfo {
  readonly name: string;
  readonly currency: string | null;
}

/** `countryInfo.txt`: ISO-2 → English name and currency. */
export function parseCountryInfo(text: string): Map<string, CountryInfo> {
  const countries = new Map<string, CountryInfo>();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const cols = line.split('\t');
    const iso = cols[0];
    const name = cols[4];
    if (iso === undefined || name === undefined || !/^[A-Z]{2}$/u.test(iso)) continue;
    const currency = cols[10] ?? '';
    countries.set(iso, { name, currency: /^[A-Z]{3}$/u.test(currency) ? currency : null });
  }
  return countries;
}

/** `admin1CodesASCII.txt`: `VN.40` → `Nghệ An Province`. */
export function parseAdmin1(text: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const line of text.split('\n')) {
    const [code, name] = line.split('\t');
    if (code !== undefined && name !== undefined && code.includes('.')) names.set(code, name);
  }
  return names;
}

export interface AlternateNames {
  readonly vi?: string;
  readonly qid?: string;
}

/** A country's `alternatenames/<CC>.txt`: geonameid → preferred Vietnamese name and Wikidata id. */
export function parseAlternateNames(text: string): Map<number, AlternateNames> {
  const byId = new Map<number, { vi?: string; viPreferred?: boolean; qid?: string }>();
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    const id = Number(cols[1]);
    const lang = cols[2];
    const value = cols[3];
    if (!Number.isInteger(id) || value === undefined || value === '') continue;
    const entry = byId.get(id) ?? {};
    if (lang === 'wkdt' && /^Q\d+$/u.test(value)) entry.qid = value;
    if (lang === 'vi' && (entry.vi === undefined || (cols[4] === '1' && !entry.viPreferred))) {
      entry.vi = value;
      entry.viPreferred = cols[4] === '1';
    }
    byId.set(id, entry);
  }
  return new Map(
    [...byId].map(([id, { vi, qid }]) => [
      id,
      { ...(vi === undefined ? {} : { vi }), ...(qid === undefined ? {} : { qid }) },
    ]),
  );
}

const SEAT_CODES = new Set(['PPLC', 'PPLA', 'PPLA2']);
export const GAP_FILL_MIN_POPULATION = 50_000;

export interface CityFileOptions {
  readonly admin1: ReadonlyMap<string, string>;
  readonly alternates?: ReadonlyMap<number, AlternateNames>;
  /** Only rows of this country (Vietnam's rows of `cities5000`). */
  readonly country?: string;
  /** Every row, not only seats and cities of 50,000 (Vietnam's top-up list). */
  readonly all?: boolean;
}

/**
 * A cities file's gap-fill candidates: a capital or a first- or second-level seat, or a city of at
 * least 50,000 people.
 */
export function parseCities(text: string, options: CityFileOptions): BaseCandidate[] {
  const rows: BaseCandidate[] = [];
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 19) continue;
    const [id, name, , , lat, lng, , code, country, , admin1] = cols;
    if (options.country !== undefined && country !== options.country) continue;
    const population = Number(cols[14]);
    const gapFill = SEAT_CODES.has(code ?? '') || population >= GAP_FILL_MIN_POPULATION;
    if (options.all !== true && !gapFill) continue;
    const geonamesId = Number(id);
    const alt = options.alternates?.get(geonamesId);
    const elevation = Number(cols[15] === '' ? cols[16] : cols[15]);
    rows.push({
      qid: alt?.qid ?? null,
      geonamesId,
      name: alt?.vi ?? name ?? '',
      names: {
        ...(name === undefined ? {} : { en: name }),
        ...(alt?.vi === undefined ? {} : { vi: alt.vi }),
      },
      countryCode: country ?? '',
      admin1: options.admin1.get(`${country}.${admin1}`) ?? null,
      kind: population >= 100_000 ? 'city' : 'town',
      lat: Number(lat),
      lng: Number(lng),
      population: Number.isFinite(population) && population > 0 ? population : null,
      sitelinks: 0,
      photoFile: null,
      elevationM: Number.isFinite(elevation) && elevation > -500 ? elevation : null,
      tz: cols[17] === '' ? null : (cols[17] ?? null),
    });
  }
  return rows;
}

export interface GeoNamesFiles {
  readonly cities: BaseCandidate[];
  readonly countries: Map<string, CountryInfo>;
  readonly admin1: Map<string, string>;
}

export async function download(fetchImpl: typeof fetch, file: string): Promise<Uint8Array> {
  const response = await fetchImpl(`${GEONAMES_BASE_URL}${file}`, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`GeoNames ${file}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadGeoNames(fetchImpl: typeof fetch = fetch): Promise<GeoNamesFiles> {
  const text = async (file: string) =>
    Buffer.from(await download(fetchImpl, file)).toString('utf8');
  const [countryText, admin1Text] = await Promise.all([
    text('countryInfo.txt'),
    text('admin1CodesASCII.txt'),
  ]);
  const admin1 = parseAdmin1(admin1Text);
  const vnAlternates = parseAlternateNames(
    unzipEntry(await download(fetchImpl, 'alternatenames/VN.zip'), 'VN.txt'),
  );
  const world = parseCities(
    unzipEntry(await download(fetchImpl, 'cities15000.zip'), 'cities15000.txt'),
    {
      admin1,
      alternates: vnAlternates,
    },
  );
  const vietnam = parseCities(
    unzipEntry(await download(fetchImpl, 'cities5000.zip'), 'cities5000.txt'),
    {
      admin1,
      alternates: vnAlternates,
      country: 'VN',
    },
  );
  const seen = new Set(world.map((row) => row.geonamesId));
  return {
    cities: [...world, ...vietnam.filter((row) => !seen.has(row.geonamesId))],
    countries: parseCountryInfo(countryText),
    admin1,
  };
}
