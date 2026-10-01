import { describe, expect, it } from 'vitest';

import { homeCollectGate, homeSetFor } from '../../critters/home-set';
import { payoutKindsFor } from '../../payout/catalogue';
import { phraseLanguageFor } from '../../trip-day/bundle';

describe('lookups keyed by country, given the country the way a row stores it', () => {
  it('finds the phrase language of a destination stored by name', () => {
    expect(phraseLanguageFor('Vietnam')).toBe('vi');
    expect(phraseLanguageFor('vn')).toBe('vi');
    expect(phraseLanguageFor('Atlantis')).toBeNull();
    expect(phraseLanguageFor(null)).toBeNull();
  });

  it('offers the home country payout kinds for a home stored by name', () => {
    expect(payoutKindsFor('Singapore')).toContain('paynow');
    expect(payoutKindsFor('VN')).toContain('vietqr');
    expect(payoutKindsFor(null)).not.toContain('vietqr');
  });

  it('gates collecting in the home set however the home country is written', () => {
    const gate = { setCountry: 'SG', exploreAtHome: false, foreground: true };
    expect(homeCollectGate({ ...gate, homeCountry: 'Singapore' })).toBe('home_needs_opt_in');
    expect(homeCollectGate({ ...gate, homeCountry: 'sg' })).toBe('home_needs_opt_in');
    expect(homeCollectGate({ ...gate, homeCountry: 'VN' })).toBe('allowed');
    expect(homeCollectGate({ ...gate, homeCountry: null })).toBe('allowed');
    const sets = [
      { id: 'sg', country: 'SG', rank: 3 },
      { id: 'vn', country: 'VN', rank: 1 },
    ];
    expect(homeSetFor('Singapore', sets)?.id).toBe('sg');
    expect(homeSetFor(null, sets)).toBeUndefined();
  });
});
