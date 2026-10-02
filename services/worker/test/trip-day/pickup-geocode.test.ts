/**
 * Placing a transfer's pickup on Mapbox v6 answers recorded in Đà Nẵng (and one constructed address
 * match, see fixtures/mapbox-geocode/README.txt): the real client parses them and the acceptance
 * rule takes only an address matched exactly or nearly so inside the destination. Mapbox has no
 * house-number addresses in Đà Nẵng, so every recorded answer there stays unplaced.
 */
import { readFileSync } from 'node:fs';

import { acceptAddress } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { mapboxPickupGeocoder } from '../../src/jobs/trip-day/pickup-placing';

const DA_NANG = { lat: 16.0544, lng: 108.2022 };
const LISBON = { lat: 38.7223, lng: -9.1393 };

function replay(file: string) {
  const body = readFileSync(new URL(`./fixtures/mapbox-geocode/${file}`, import.meta.url), 'utf8');
  const urls: string[] = [];
  const geocoder = mapboxPickupGeocoder({
    accessToken: 'replay',
    http: {
      fetch: (input) => {
        urls.push(input);
        return Promise.resolve(new Response(body, { status: 200 }));
      },
    },
  });
  return { geocoder, urls };
}

describe('placing a pickup on Mapbox', () => {
  it.each([
    ['v6-forward-address-vo-nguyen-giap-da-nang.json', '10 Võ Nguyên Giáp, Đà Nẵng'],
    ['v6-forward-street-only-vo-nguyen-giap-da-nang.json', '10 Vo Nguyen Giap, Da Nang, Vietnam'],
    ['v6-forward-locality-only-bach-dang-da-nang.json', '35 Bạch Đằng, Hải Châu, Đà Nẵng'],
    ['v6-forward-hotel-lobby-da-nang.json', 'hotel lobby'],
  ])('leaves %s unplaced', async (file, text) => {
    const { geocoder } = replay(file);
    const addresses = await geocoder.addresses(text, DA_NANG);
    expect(acceptAddress(addresses, DA_NANG)).toBeNull();
  });

  it('reads the feature type and match confidence of what Mapbox found', async () => {
    const streets = await replay(
      'v6-forward-street-only-vo-nguyen-giap-da-nang.json',
    ).geocoder.addresses('10 Vo Nguyen Giap, Da Nang, Vietnam', DA_NANG);
    expect(streets.length).toBeGreaterThan(0);
    expect(
      streets.every((street) => street.featureType === 'street' && street.confidence === null),
    ).toBe(true);
  });

  it('places an exact address match inside the destination, asking for addresses near it', async () => {
    const { geocoder, urls } = replay('v6-forward-address-constructed-lisbon.json');
    const addresses = await geocoder.addresses('Rua Augusta 24, Lisboa', LISBON);
    expect(acceptAddress(addresses, LISBON)).toMatchObject({
      source: 'mapbox',
      label: 'Rua Augusta 24, 1100-053 Lisboa, Portugal',
      lat: 38.71028,
      lng: -9.14273,
    });
    expect(acceptAddress(addresses, DA_NANG)).toBeNull();
    expect(urls[0]).toContain('permanent=true');
    expect(urls[0]).toContain('types=address');
    expect(urls[0]).toContain(`proximity=${LISBON.lng},${LISBON.lat}`);
  });
});
