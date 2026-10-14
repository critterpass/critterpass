import { describe, expect, it } from 'vitest';

import type { BaseCandidate } from './base-set';
import { aliasKey, isTwin, sharesName, type TwinPlace } from './critter-twins';
import { planUpsert, type ExistingDestination } from './upsert-plan';

const place = (overrides: Partial<TwinPlace> & Pick<TwinPlace, 'names'>): TwinPlace => ({
  countryCode: null,
  country: null,
  lat: null,
  lng: null,
  ...overrides,
});

describe('critter twins', () => {
  it('treats the local, English and official names of one city as the same', () => {
    expect(aliasKey('Thành phố Hồ Chí Minh')).toBe(aliasKey('Sài Gòn'));
    expect(aliasKey('Ho Chi Minh City')).toBe(aliasKey('Saigon'));
    expect(aliasKey('New York City')).toBe(aliasKey('New York'));
    expect(sharesName(['Sài Gòn'], ['Thành phố Hồ Chí Minh'])).toBe(true);
    expect(sharesName(['New York'], ['York'])).toBe(false);
    expect(sharesName(['Taipei'], ['New Taipei City'])).toBe(false);
  });

  it('matches by slug prefix or country name when the critter row has no code or centre', () => {
    const saigon = place({ slug: 'vn-sai-gon', names: ['Sài Gòn'], country: 'Vietnam' });
    expect(
      isTwin(saigon, place({ names: ['Thành phố Hồ Chí Minh'], countryCode: 'VN', lat: 10.8 })),
    ).toBe(true);
    const newYork = place({ slug: 'us-new-york', names: ['New York'] });
    expect(isTwin(newYork, place({ names: ['New York City'], countryCode: 'US' }))).toBe(true);
  });

  it('keeps namesakes in other countries and far-apart places apart', () => {
    const london = place({ slug: 'gb-london', names: ['London'], countryCode: 'GB' });
    expect(isTwin(london, place({ names: ['London'], countryCode: 'CA' }))).toBe(false);
    const tokyo = place({ names: ['Tokyo'], countryCode: 'JP', lat: 35.69, lng: 139.69 });
    expect(
      isTwin(tokyo, place({ names: ['Tokyo'], countryCode: 'JP', lat: 35.7, lng: 139.6 })),
    ).toBe(true);
    expect(
      isTwin(tokyo, place({ names: ['Tokyo'], countryCode: 'JP', lat: 34.7, lng: 135.5 })),
    ).toBe(false);
  });
});

function candidate(overrides: Partial<BaseCandidate> & Pick<BaseCandidate, 'name'>): BaseCandidate {
  return {
    qid: null,
    geonamesId: null,
    names: {},
    countryCode: 'VN',
    admin1: null,
    kind: 'city',
    lat: 10.78,
    lng: 106.7,
    population: null,
    sitelinks: 0,
    photoFile: null,
    ...overrides,
  };
}

const critter = (
  overrides: Partial<ExistingDestination> & Pick<ExistingDestination, 'id' | 'slug' | 'name'>,
): ExistingDestination => ({
  country: null,
  countryCode: null,
  origin: 'critter',
  qid: null,
  geonamesId: null,
  ...overrides,
});

describe('planUpsert with critter twins', () => {
  const countryNames = new Map([
    ['VN', 'Vietnam'],
    ['JP', 'Japan'],
    ['US', 'United States'],
  ]);

  it('enriches the critter row an alias names instead of adding a base row', () => {
    const plan = planUpsert(
      [
        candidate({
          name: 'Thành phố Hồ Chí Minh',
          qid: 'Q1854',
          names: { en: 'Ho Chi Minh City' },
        }),
        candidate({ name: 'New York City', qid: 'Q60', countryCode: 'US', lat: 40.7, lng: -74 }),
      ],
      [
        critter({ id: 'sg', slug: 'vn-sai-gon', name: 'Sài Gòn', country: 'Vietnam' }),
        critter({ id: 'ny', slug: 'us-new-york', name: 'New York', country: 'United States' }),
      ],
      countryNames,
    );
    expect(plan.map((row) => [row.slug, row.existing?.id ?? null])).toEqual([
      ['vn-sai-gon', 'sg'],
      ['us-new-york', 'ny'],
    ]);
  });

  it('drops a second candidate for a claimed critter row, but keeps a distant namesake', () => {
    const plan = planUpsert(
      [
        candidate({ name: 'Tokyo', qid: 'Q1490', countryCode: 'JP', lat: 35.69, lng: 139.69 }),
        candidate({ name: 'Tokyo', qid: 'Q7473516', countryCode: 'JP', lat: 35.68, lng: 139.77 }),
        candidate({ name: 'Tokyo', qid: 'Q99', countryCode: 'JP', lat: 43.0, lng: 141.3 }),
      ],
      [
        critter({
          id: 'tk',
          slug: 'jp-tokyo',
          name: 'Tokyo',
          country: 'Japan',
          countryCode: 'JP',
          qid: 'Q1490',
          lat: 35.69,
          lng: 139.69,
        }),
      ],
      countryNames,
    );
    expect(plan.map((row) => [row.slug, row.candidate.qid, row.existing?.id ?? null])).toEqual([
      ['jp-tokyo', 'Q1490', 'tk'],
      ['jp-tokyo-2', 'Q99', null],
    ]);
  });

  it('lets the id owner keep its row when a namesake comes first', () => {
    const plan = planUpsert(
      [
        candidate({ name: 'Tokyo', qid: 'Q7473516', countryCode: 'JP', lat: 35.68, lng: 139.77 }),
        candidate({ name: 'Tokyo', qid: 'Q1490', countryCode: 'JP', lat: 35.69, lng: 139.69 }),
      ],
      [
        critter({
          id: 'tk',
          slug: 'jp-tokyo',
          name: 'Tokyo',
          country: 'Japan',
          countryCode: 'JP',
          qid: 'Q1490',
          lat: 35.69,
          lng: 139.69,
        }),
      ],
      countryNames,
    );
    expect(plan.map((row) => [row.slug, row.candidate.qid])).toEqual([['jp-tokyo', 'Q1490']]);
  });
});
