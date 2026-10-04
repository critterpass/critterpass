/**
 * Address search: when the search asks for street addresses at all, which rows of the lookup's
 * answer become address rows, and what the section shows for the text in the field now.
 */
import { describe, expect, it } from '@jest/globals';

import { looksLikeAddress, wantsAddresses } from '../address-rule';
import { addressesFrom, addressesState } from '../use-addresses';

describe('looksLikeAddress', () => {
  it.each([
    '12 Trần Phú',
    'K12/5 Lê Duẩn',
    'đường Bạch Đằng',
    'Duong Bach Dang',
    'hẻm Hoàng Diệu',
    'kiệt Ông Ích Khiêm',
    'Sukhumvit Soi Eleven',
    'Jl. Raya Ubud',
    'Baker St',
    'Abbey Road',
  ])('takes "%s" for an address', (text) => {
    expect(looksLikeAddress(text)).toBe(true);
  });

  it.each(['Chợ Hàn', 'Marble Mountains', 'Stella coffee', 'Broadway', 'bánh mì Phượng'])(
    'takes "%s" for a place name',
    (text) => {
      expect(looksLikeAddress(text)).toBe(false);
    },
  );
});

describe('wantsAddresses', () => {
  it('asks for text that reads like an address, however many places matched', () => {
    expect(wantsAddresses('12 Trần Phú', 9, false)).toBe(true);
    expect(wantsAddresses('12 Trần Phú', null, false)).toBe(true);
  });

  it('asks for a place name only once our own search finished with fewer than five', () => {
    expect(wantsAddresses('Chợ Hàn', null, false)).toBe(false);
    expect(wantsAddresses('Chợ Hàn', 4, false)).toBe(true);
    expect(wantsAddresses('Chợ Hàn', 5, false)).toBe(false);
  });

  it('never asks offline or for a letter or two', () => {
    expect(wantsAddresses('12 Trần Phú', 0, true)).toBe(false);
    expect(wantsAddresses(' 12 ', 0, false)).toBe(false);
  });
});

const ANSWER = {
  results: [
    { source: 'poi', label: 'Chợ Hàn, 119 Trần Phú', lat: 16.068, lng: 108.224, poiId: 'p1' },
    {
      source: 'mapbox',
      label: 'Trần Phú, Hải Châu, 50200, Da Nang, Vietnam',
      lat: 16.0712,
      lng: 108.2236,
    },
    { source: 'mapbox', label: 'Rua Augusta 24', lat: 38.71, lng: -9.14 },
    { source: 'mapbox', label: ' , Nowhere', lat: 1, lng: 1 },
    { source: 'mapbox', label: 'No point' },
  ],
  attribution: [
    { label: '© Mapbox', url: 'https://www.mapbox.com/about/maps' },
    { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/about' },
  ],
};

describe('addressesFrom', () => {
  it('keeps the address rows with a line and a point, split into the line and the rest', () => {
    const found = addressesFrom(ANSWER);
    expect(found.addresses).toEqual([
      { line: 'Trần Phú', rest: 'Hải Châu, 50200, Da Nang, Vietnam', lat: 16.0712, lng: 108.2236 },
      { line: 'Rua Augusta 24', rest: null, lat: 38.71, lng: -9.14 },
    ]);
    expect(found.credits.map((credit) => credit.label)).toEqual(['© Mapbox', '© OpenStreetMap']);
  });

  it('reads an answer of another shape as no addresses', () => {
    expect(addressesFrom(null)).toEqual({ addresses: [], credits: [] });
    expect(addressesFrom({ results: 'none' })).toEqual({ addresses: [], credits: [] });
  });
});

describe('addressesState', () => {
  const found = { key: 'near\u000012 Trần Phú', ...addressesFrom(ANSWER) };

  it('shows nothing when addresses are not wanted, even with an answer in hand', () => {
    expect(addressesState(false, found.key, found)).toEqual({ kind: 'none' });
  });

  it('is loading until the answer is for the text in the field now', () => {
    expect(addressesState(true, found.key, null)).toEqual({ kind: 'loading' });
    expect(addressesState(true, 'near\u000012 Trần Phú, Đà Nẵng', found)).toEqual({
      kind: 'loading',
    });
  });

  it('shows the addresses and their credits for the text they answer', () => {
    const state = addressesState(true, found.key, found);
    expect(state).toEqual({ kind: 'done', addresses: found.addresses, credits: found.credits });
  });
});
