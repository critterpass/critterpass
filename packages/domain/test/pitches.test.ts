import { describe, expect, it } from 'vitest';

import {
  buildPitchSections,
  pitchChips,
  pitchUngroundedTokens,
  validatePitchText,
  type PitchFacts,
} from '../src/pitches';

const id = (n: number) => `0199a0f2-7c1e-7d4b-9a53-${String(n).padStart(12, '0')}`;
const facts: PitchFacts = {
  place: { id: id(1), name: 'Tokyo', country: 'Japan', coverage: 'live', guide: 'pon' },
  crew: { name: 'Night Owls', size: 5 },
  month: 12,
  fares: [
    {
      origin: 'SGN',
      members: 3,
      price_minor: 5_400_000,
      currency: 'VND',
      duration_min: 360,
      transfers: 0,
      seen_at: null,
    },
  ],
  season: { best_months: [3, 11], events: [] },
  taste: [{ tag: 'NIGHTLIFE', member_ids: [id(2), id(3)] }],
  alternatives: [
    { place_id: id(4), name: 'Osaka', kind: 'cheaper', delta_minor: 18_000, currency: 'USD' },
  ],
};

describe('pitch grounding', () => {
  it('accepts zero-exponent prices, hours, headcounts, deltas and the facts’ months', () => {
    expect(
      pitchUngroundedTokens(
        '₫5,400,000 each, 6 hours, 3 of you, $180 less, December or March',
        facts,
      ),
    ).toEqual([]);
  });

  it('flags anything else', () => {
    expect(pitchUngroundedTokens('₫5,000,000 in July', facts)).toEqual(['5,000,000', 'July']);
    expect(validatePitchText('headline', 'x'.repeat(61), facts)).toBeNull();
    expect(validatePitchText('quote', '"Tokyo never sleeps"', facts)).toBe('Tokyo never sleeps');
  });
});

describe('pitch sections', () => {
  it('builds chips from the tools and ties reasons to the tagged members', () => {
    expect(pitchChips(facts)).toEqual([
      { kind: 'price', amount_minor: 5_400_000, currency: 'VND', origin: 'SGN' },
      { kind: 'flight', minutes: 360, origin: 'SGN' },
      { kind: 'best_months', months: [3, 11] },
    ]);
    expect(pitchChips({ ...facts, fares: [] })[0]).toEqual({ kind: 'prices_pending' });
    const sections = buildPitchSections(facts, [
      { s: 'headline', text: 'Tokyo after dark' },
      { s: 'reason', text: 'Late nights', tag: 'NIGHTLIFE' },
    ]);
    expect(sections.reasons[0]?.member_ids).toEqual([id(2), id(3)]);
    expect(sections.quote).toBeNull();
  });
});
