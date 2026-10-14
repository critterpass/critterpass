/**
 * The guides loader's rules, the researchers' checker's own: a profile is the guide's canonical
 * page, nothing shown carries a phone number or an email, and a rating is kept only from a
 * third-party platform (a score read off the guide's own site is stored as none).
 */
import { describe, expect, it } from 'vitest';

import {
  canonicalProfile,
  contactProblem,
  languageCodes,
  localGuideRowSchema,
  thirdPartyRating,
  type LocalGuideRow,
} from '../../src/destinations/local-guides/rows';

const GUIDE: LocalGuideRow = localGuideRowSchema.parse({
  destination: 'th-bangkok',
  name: 'Co van Kessel Bangkok Tours',
  type: 'company',
  languages: ['en', 'NL', 'english'],
  specialties: ['bike tours'],
  areas: ['Chinatown'],
  price: { text: 'from 1,250 THB for 3 hours', source_url: 'https://covankessel.com/bangkok' },
  profile_url: 'https://covankessel.com/bangkok',
  review_summary_en: 'Praised for backstreet routes and good English.',
  review_summary_vi: 'Được khen vì lộ trình đường nhỏ.',
  rating: {
    value: 4.9,
    count: 1521,
    platform: 'GetYourGuide',
    url: 'https://covankessel.com/bangkok',
  },
  licensed: 'unknown',
  sources: ['https://covankessel.com/bangkok'],
});

describe('local guide rules', () => {
  it('keeps a canonical page, tidied, and refuses mirrors, staging hosts and list pages', () => {
    expect(canonicalProfile('http://www.toursbylocals.com/Somchai?utm_source=x#reviews')).toEqual({
      url: 'https://www.toursbylocals.com/Somchai',
    });
    for (const refused of [
      'https://bangkok.withlocals.com/experience/x',
      'https://guide.kinsta.page/',
      'https://www.toursbylocals.com/tours/thailand/bangkok/guides',
      'https://www.tripadvisor.com/Attractions-g293916',
    ]) {
      expect(canonicalProfile(refused)).toHaveProperty('problem');
    }
  });

  it('refuses a phone number or an email in what a reader sees', () => {
    expect(contactProblem(GUIDE)).toBeNull();
    expect(contactProblem({ ...GUIDE, review_summary_en: 'Call +66 81 234 5678 to book.' })).toBe(
      'looks like a phone number',
    );
    expect(contactProblem({ ...GUIDE, name: 'Somchai (somchai@gmail.com)' })).toBe(
      'looks like an email',
    );
    expect(
      contactProblem({
        ...GUIDE,
        price: { text: 'ask at tours@covankessel.com', source_url: null },
      }),
    ).toBe('looks like an email');
  });

  it('stores a score read off the guide’s own site as none, and keeps a platform’s', () => {
    expect(thirdPartyRating(GUIDE)).toBeNull();
    expect(
      thirdPartyRating({
        ...GUIDE,
        rating: {
          ...GUIDE.rating!,
          platform: 'Google (as shown on company site)',
          url: 'https://g.page/x',
        },
      }),
    ).toBeNull();
    const platform = {
      value: 4.8,
      count: 96,
      platform: 'Tours by Locals',
      url: 'https://www.toursbylocals.com/somchai',
    };
    expect(
      thirdPartyRating({
        ...GUIDE,
        profile_url: 'https://www.toursbylocals.com/somchai',
        rating: platform,
      }),
    ).toEqual(platform);
    const tripadvisor = {
      ...platform,
      platform: 'Tripadvisor',
      url: 'https://www.tripadvisor.co.uk/x',
    };
    expect(thirdPartyRating({ ...GUIDE, rating: tripadvisor })).toEqual(tripadvisor);
  });

  it('keeps language codes only', () => {
    expect(languageCodes(GUIDE.languages)).toEqual(['en', 'nl']);
  });
});
