import { describe, expect, it } from 'vitest';

import { checkDestinationBriefReply, stayProblem, type ProfilePage } from '../src';

const SIGHTS: ProfilePage = {
  url: 'https://example.vn/da-lat-sights',
  title: 'Đà Lạt sights',
  text: 'Datanla Waterfall is a short ride south of town, with a mountain coaster down to the falls. Crazy House opens at 8:30.',
};
const STAYS: ProfilePage = {
  url: 'https://example.vn/da-lat-hotels',
  title: 'Where to stay',
  text: 'Budget rooms cost 250.000–400.000 VND a night, mid-range hotels 700k to 1.2 million VND.',
};

const essential = (overrides: Record<string, unknown> = {}) => ({
  name: 'Datanla Waterfall',
  local_name: 'Thác Datanla',
  kind: 'nature',
  area: null,
  why: { en: 'Ride the coaster down to the falls.', vi: 'Đi máng trượt xuống thác.' },
  source_url: SIGHTS.url,
  quote: 'Datanla Waterfall is a short ride south of town',
  ...overrides,
});

const stay = (overrides: Record<string, unknown> = {}) => ({
  tier: 'budget',
  low: 250000,
  high: 400000,
  currency: 'VND',
  source_url: STAYS.url,
  quote: 'Budget rooms cost 250.000–400.000 VND a night',
  ...overrides,
});

const check = (raw: Record<string, unknown>) =>
  checkDestinationBriefReply(
    { decision: 'write', essentials: [], eateries: [], stays: [], ...raw },
    [SIGHTS, STAYS],
    ['en', 'vi'],
  );

describe('destination brief cite-or-drop', () => {
  it('keeps an essential whose quote is on its page and names it', () => {
    const brief = check({ essentials: [essential()] });
    expect(brief.decision).toBe('write');
    if (brief.decision !== 'write') return;
    expect(brief.essentials).toHaveLength(1);
    expect(brief.essentials[0]?.source.url).toBe(SIGHTS.url);
    expect(brief.essentials[0]?.why.en).toBe('Ride the coaster down to the falls.');
  });

  it('drops an essential with an invented quote, an unknown page or a quote about something else', () => {
    const brief = check({
      essentials: [
        essential({ quote: 'Datanla Waterfall is the tallest in Asia' }),
        essential({ name: 'Langbiang', local_name: null, source_url: 'https://other.vn/x' }),
        essential({ name: 'Hồ Tuyền Lâm', local_name: null, quote: 'Crazy House opens at 8:30.' }),
      ],
    });
    if (brief.decision !== 'write') throw new Error('expected a write');
    expect(brief.essentials).toEqual([]);
    expect(brief.dropped.map((d) => d.reason)).toEqual([
      'quote_not_on_page',
      'unknown_source',
      'quote_not_about_place',
    ]);
  });

  it('blanks a why line whose number its page does not hold', () => {
    const brief = check({
      essentials: [essential({ why: { en: 'Open from 6:00 every day.', vi: 'Thác đẹp.' } })],
    });
    if (brief.decision !== 'write') throw new Error('expected a write');
    expect(brief.essentials[0]?.why).toEqual({ vi: 'Thác đẹp.' });
  });

  it('keeps a stay band only when its quote holds both amounts', () => {
    const brief = check({
      stays: [
        stay(),
        stay({
          tier: 'mid',
          low: 700000,
          high: 1500000,
          quote: 'mid-range hotels 700k to 1.2 million VND',
        }),
        stay({ tier: 'upscale', low: 4000000, high: 6000000, quote: 'Luxury from 4 million' }),
      ],
    });
    if (brief.decision !== 'write') throw new Error('expected a write');
    expect(brief.stays.map((s) => s.tier)).toEqual(['budget']);
    expect(brief.stays[0]?.source.quote).toContain('250.000');
    expect(brief.dropped.map((d) => [d.name, d.reason])).toEqual([
      ['mid', 'amount_not_in_quote'],
      ['upscale', 'quote_not_on_page'],
    ]);
  });

  it('refuses an inverted or empty range', () => {
    expect(stayProblem({ low: 400000, high: 250000 }, '250.000–400.000 VND')).toBe('bad_range');
    expect(stayProblem({ low: 0, high: 250000 }, '0 to 250.000 VND')).toBe('bad_range');
    expect(stayProblem({ low: 700000, high: 1200000 }, '700k to 1.2 million VND')).toBeNull();
  });

  it('passes a decline through and reads a malformed reply as unreadable', () => {
    expect(check({ decision: 'decline' }).decision).toBe('decline');
    expect(checkDestinationBriefReply({ nope: true }, [], ['en']).decision).toBe('unreadable');
  });
});
