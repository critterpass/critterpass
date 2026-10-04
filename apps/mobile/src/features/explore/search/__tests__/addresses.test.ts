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

const typing = { offline: false, question: false } as const;

describe('wantsAddresses', () => {
  it('asks for text that reads like an address, however many places matched', () => {
    expect(wantsAddresses({ ...typing, query: '12 Trần Phú', results: 9 })).toBe(true);
    expect(wantsAddresses({ ...typing, query: '12 Trần Phú', results: null })).toBe(true);
    expect(
      wantsAddresses({ query: 'dinner on Abbey Road', results: 3, offline: false, question: true }),
    ).toBe(true);
  });

  it('asks for a short name only once our own search finished with no place at all', () => {
    expect(wantsAddresses({ ...typing, query: 'Villa Hoa Sua', results: null })).toBe(false);
    expect(wantsAddresses({ ...typing, query: 'Villa Hoa Sua', results: 0 })).toBe(true);
    expect(wantsAddresses({ ...typing, query: 'Villa Hoa Sua', results: 1 })).toBe(false);
  });

  it('spends nothing on a plain-words question, or while a submitted one is still being read', () => {
    const question = { query: 'quiet rooftop bar', results: 0, offline: false };
    expect(wantsAddresses({ ...question, question: true })).toBe(false);
    expect(wantsAddresses({ ...question, question: null })).toBe(false);
  });

  it('takes more than six words for a question, not a name', () => {
    const words = { ...typing, results: 0 };
    expect(wantsAddresses({ ...words, query: 'the blue house by the old bridge' })).toBe(false);
    expect(wantsAddresses({ ...words, query: 'blue house by the old bridge' })).toBe(true);
  });

  it('never asks offline or for a letter or two', () => {
    expect(
      wantsAddresses({ query: '12 Trần Phú', results: 0, offline: true, question: false }),
    ).toBe(false);
    expect(wantsAddresses({ ...typing, query: ' 12 ', results: 0 })).toBe(false);
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
