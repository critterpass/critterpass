/**
 * The guest brief's guards: only allow-listed, non-supplier pages count as sources, a fact keeps
 * a number only when its page has it, links and unknown pages are refused, and crew sizes share a
 * brief by bucket.
 */
import { describe, expect, it } from 'vitest';

import { allowedDomainOf, GUEST_BRIEF_DOMAINS } from '../src/prompts/guest-brief/domains';
import {
  checkGuestFact,
  crewSizeBucket,
  guestBriefQueries,
  parseGuestFact,
  type GuestBriefSource,
} from '../src/prompts/guest-brief/prompt';
import { SUPPLIER_BRANDS } from '../src/tools/blocked-domains';

const page: GuestBriefSource = {
  url: 'https://en.wikivoyage.org/wiki/Kotor',
  domain: 'wikivoyage.org',
  title: 'Kotor',
  snippet: 'Climbing the 1,350 steps to the fortress takes about an hour.',
};

describe('guest brief sources', () => {
  it('allows the listed domains and their subdomains only, never a supplier', () => {
    expect(allowedDomainOf('https://en.wikivoyage.org/wiki/Kotor')).toBe('wikivoyage.org');
    expect(allowedDomainOf('https://www.gov.uk/foreign-travel-advice/morocco')).toBe('gov.uk');
    expect(allowedDomainOf('https://www.tripadvisor.com/Tourism-g293734')).toBeNull();
    expect(allowedDomainOf('https://notwikivoyage.org/x')).toBeNull();
    for (const brand of SUPPLIER_BRANDS) {
      expect(GUEST_BRIEF_DOMAINS.some((domain) => domain.includes(brand.toLowerCase()))).toBe(
        false,
      );
    }
  });

  it('searches the place, the season and the advice', () => {
    expect(guestBriefQueries({ name: 'Kotor', country: 'Montenegro' })).toEqual([
      'Kotor Montenegro travel guide',
      'Kotor Montenegro best time to visit weather',
      'Kotor Montenegro travel advice',
    ]);
  });
});

describe('guest facts', () => {
  const line = (text: string, source = 1) => JSON.stringify({ icon: 'walk', text, source });

  it('keeps a fact whose numbers are on its page', () => {
    expect(
      parseGuestFact(line('The 1,350 steps to the fortress take about an hour.'), [page]),
    ).toEqual({
      icon: 'walk',
      text: 'The 1,350 steps to the fortress take about an hour.',
      url: page.url,
      domain: 'wikivoyage.org',
    });
  });

  it('refuses unsourced numbers, links, unknown pages, long lines and other shapes', () => {
    expect(checkGuestFact(line('The 2,000 steps take an hour.'), [page])).toEqual({
      problem: 'unsourced_number',
    });
    expect(checkGuestFact(line('Book at www.deal.example'), [page])).toEqual({ problem: 'link' });
    expect(checkGuestFact(line('Steps.', 2), [page])).toEqual({ problem: 'unknown_page' });
    expect(checkGuestFact(line('x'.repeat(91)), [page])).toEqual({ problem: 'too_long' });
    expect(checkGuestFact('| a | table |', [page])).toEqual({ problem: 'not_json' });
    expect(checkGuestFact('{"text":"no icon","source":1}', [page])).toEqual({ problem: 'schema' });
  });

  it('shares a brief within crew-size buckets', () => {
    expect([1, 2, 4, 5, 8, 9, 16].map(crewSizeBucket)).toEqual([
      '1',
      '2-4',
      '2-4',
      '5-8',
      '5-8',
      '9+',
      '9+',
    ]);
  });
});
