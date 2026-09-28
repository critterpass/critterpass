/**
 * The geo hint over the recorded MaxMind test database (MaxMind-DB `test-data`, MIT/Apache-2.0;
 * DB-IP Lite City uses the same GeoIP2 City layout): city-level fields, a rounded city centre,
 * nearest airports from the bundled dataset, and nulls whenever the database cannot answer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { geoHintSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { geoHintFor, loadGeoIpDatabase, mmdbGeoLookup } from '../../src/routes/geo';

const GEO_DB = fileURLToPath(new URL('../fixtures/geo/GeoLite2-City-Test.mmdb', import.meta.url));
const bytes = readFileSync(GEO_DB);
const lookup = mmdbGeoLookup(bytes);

describe('geoHintFor', () => {
  it('answers country, city, a rounded centre and the nearest airports', () => {
    const hint = geoHintFor(lookup, '89.160.20.112');
    expect(hint).toEqual({
      country: 'SE',
      city: 'Linköping',
      point: { lat: 58.4, lng: 15.6 },
      nearest_iata: ['LPI', 'NRK', 'NYO'],
    });
    expect(geoHintSchema.parse(hint)).toEqual(hint);
  });

  it.each([
    ['a private address', '192.168.1.1'],
    ['loopback over IPv6', '::1'],
    ['something that is not an address', 'not-an-ip'],
  ])('answers nulls for %s', (_label, ip) => {
    expect(geoHintFor(lookup, ip)).toEqual({
      country: null,
      city: null,
      point: null,
      nearest_iata: [],
    });
  });

  it('answers nulls without a database or a client address', () => {
    expect(geoHintFor(null, '81.2.69.142').country).toBeNull();
    expect(geoHintFor(lookup, undefined).country).toBeNull();
  });
});

describe('loadGeoIpDatabase', () => {
  it('reads a database from a path', async () => {
    expect((await loadGeoIpDatabase(GEO_DB)).lookup('81.2.69.142')?.city).toBe('London');
  });

  it('downloads and gunzips a database from an https URL', async () => {
    const requested: string[] = [];
    const fetchGz = (input: string) => {
      requested.push(input);
      return Promise.resolve(new Response(gzipSync(bytes)));
    };
    const loaded = await loadGeoIpDatabase(
      'https://download.example.test/dbip-city-lite.mmdb.gz',
      fetchGz as unknown as typeof fetch,
    );
    expect(requested).toEqual(['https://download.example.test/dbip-city-lite.mmdb.gz']);
    expect(loaded.lookup('175.16.199.0')?.country).toBe('CN');
  });

  it('fails loudly on a download error', async () => {
    const notFound = () => Promise.resolve(new Response('gone', { status: 404 }));
    await expect(
      loadGeoIpDatabase(
        'https://download.example.test/x.mmdb',
        notFound as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/HTTP 404/);
  });
});
