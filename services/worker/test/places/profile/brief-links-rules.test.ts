/**
 * The recorded replies for Cusco, Đà Nẵng and Ho Chi Minh City to Đà Nẵng against the pages they
 * were written from, read as the run reads them: what survives cite-or-drop, and the rules of a
 * links run that need no database.
 */
import { readFileSync } from 'node:fs';

import {
  checkDestinationLinksReply,
  checkHomeLinkReply,
  parseStructuredText,
  type ProfilePage,
} from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { linksSkipReason } from '../../../src/places/profile/brief-links';
import {
  areaSlugPart,
  costMinor,
  type LinksTarget,
} from '../../../src/places/profile/brief-links-store';
import { homeCity } from '../../../src/places/profile/home-link';
import { htmlText, pageWindow } from '../../../src/places/profile/pages';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const file = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

function recorded(name: string): unknown {
  const { body } = (
    JSON.parse(file(`${name}.json`)) as {
      response: { body: { content: { type: string; text?: string }[] } };
    }
  ).response;
  return parseStructuredText(body.content.find((block) => block.type === 'text')?.text ?? '');
}

function pages(searx: string, files: readonly string[], near: string): ProfilePage[] {
  const { results } = (
    JSON.parse(file(`${searx}.json`)) as { response: { body: { results: { url: string }[] } } }
  ).response.body;
  return results.map((result, i) => {
    const { title, text } = htmlText(file(files[i] ?? ''));
    return { url: result.url, title, text: pageWindow(text, [near]) };
  });
}

describe('recorded link replies against their pages', () => {
  it('keeps Cusco to Machu Picchu by train, with the sentence that times it', () => {
    const checked = checkDestinationLinksReply(
      recorded('deepseek-links-cusco'),
      { name: 'Cusco', country: 'Peru' },
      pages('searx-links-cusco', ['page-links-cusco-1.html', 'page-links-cusco-2.html'], 'Cusco'),
      ['en'],
    );
    if (checked.decision !== 'write') throw new Error(checked.decision);
    expect(checked.links.map((l) => [l.to, l.kind, l.mode, l.minutes, l.dayLength])).toEqual([
      ['Machu Picchu', 'day_trip', 'train', 240, 'full'],
      ['Pisac', 'day_trip', 'car', 35, 'half'],
    ]);
    expect(checked.links[0]).toMatchObject({
      essential: true,
      sources: [
        {
          url: 'https://www.salkantaytrekking.com/blog/machu-picchu-the-easy-way',
          quote: 'The train journey from Cusco to Machu Picchu takes no more than 4 hours',
        },
      ],
    });
    expect(checked.dropped.length).toBeGreaterThan(0);
  });

  it('keeps Đà Nẵng to Hội An with its cited fare', () => {
    const checked = checkDestinationLinksReply(
      recorded('deepseek-links-da-nang'),
      { name: 'Đà Nẵng', country: 'Vietnam' },
      pages(
        'searx-links-da-nang',
        ['page-links-da-nang-1.html', 'page-links-da-nang-2.html'],
        'Đà Nẵng',
      ),
      ['en', 'vi'],
    );
    if (checked.decision !== 'write') throw new Error(checked.decision);
    expect(checked.links.map((l) => [l.to, l.kind, l.mode, l.minutes, l.dayLength])).toEqual([
      ['Hoi An', 'day_trip', 'car', 45, 'full'],
      ['An Bang Beach', 'day_trip', 'car', 30, 'half'],
      ['Marble Mountains', 'day_trip', 'car', 20, 'half'],
    ]);
    expect(checked.links[0]).toMatchObject({ cost: { amount: 15, currency: 'USD' } });
    expect(checked.links[0]?.sources).toHaveLength(2);
    expect(checked.links[0]?.note['vi']).toBeTruthy();
  });

  it('keeps the flight and the bus from Ho Chi Minh City, and drops a train time no row states', () => {
    const checked = checkHomeLinkReply(
      recorded('deepseek-home-link'),
      { name: 'Ho Chi Minh City', country: 'Vietnam' },
      { name: 'Đà Nẵng', country: 'Vietnam' },
      pages('searx-home-link', ['page-home-link-sgn-da-nang.html'], 'Đà Nẵng'),
      ['en', 'vi'],
    );
    if (checked.decision !== 'write') throw new Error(checked.decision);
    expect(checked.ways.map((w) => [w.mode, w.minutes, w.cost])).toEqual([
      ['flight', 80, { amount: 653061, currency: 'VND' }],
      ['bus', 1405, { amount: 560000, currency: 'VND' }],
    ]);
    expect(checked.dropped).toEqual([{ mode: 'train', reason: 'duration_not_in_quote' }]);
  });
});

describe('links run rules', () => {
  const target = (over: Partial<LinksTarget> = {}): LinksTarget => ({
    id: 'd',
    slug: 'cusco',
    name: 'Cusco',
    country: 'Peru',
    currency: 'PEN',
    tz: 'America/Lima',
    coverage: 'live',
    setId: 's',
    setCode: 'pe',
    runStatus: null,
    runExpiresAt: null,
    ...over,
  });
  const now = new Date('2026-10-06T10:00:00Z');
  const later = new Date('2026-12-01T00:00:00Z');

  it('runs for a city never looked at, a failed run and a forced one; not for an area, fresh links or a spent cap', () => {
    expect(linksSkipReason(target(), false, 0, 100, now)).toBeNull();
    expect(linksSkipReason(null, false, 0, 100, now)).toBe('missing');
    expect(linksSkipReason(target({ coverage: 'area' }), true, 0, 100, now)).toBe('area');
    const ready = target({ runStatus: 'ready', runExpiresAt: later });
    expect(linksSkipReason(ready, false, 0, 100, now)).toBe('exists');
    expect(linksSkipReason(ready, true, 0, 100, now)).toBeNull();
    expect(linksSkipReason(ready, true, 100, 100, now)).toBe('daily_cap');
    // A run that found nothing waits out its shorter retry; a failed one does not wait.
    expect(
      linksSkipReason(target({ runStatus: 'declined', runExpiresAt: later }), false, 0, 100, now),
    ).toBe('exists');
    expect(
      linksSkipReason(target({ runStatus: 'failed', runExpiresAt: later }), false, 0, 100, now),
    ).toBeNull();
    expect(
      linksSkipReason(target({ runStatus: 'ready', runExpiresAt: now }), false, 0, 100, now),
    ).toBeNull();
  });

  it('writes costs in whole minor units and leaves out a currency it does not know', () => {
    expect(costMinor({ amount: 15, currency: 'USD' })).toEqual({ minor: 1500, currency: 'USD' });
    expect(costMinor({ amount: 653061, currency: 'VND' })).toEqual({
      minor: 653061,
      currency: 'VND',
    });
    expect(costMinor({ amount: 3, currency: 'ZZZ' })).toBeNull();
    expect(costMinor(null)).toBeNull();
  });

  it('slugs an area as the city generator slugs a city', () => {
    expect(areaSlugPart('Machu Picchu')).toBe('machu-picchu');
    expect(areaSlugPart('Hội An')).toBe('hoi-an');
    expect(areaSlugPart('Bà Nà Hills ')).toBe('ba-na-hills');
  });

  it('reads a home code as its city, never more', () => {
    expect(homeCity('SGN')).toEqual({ name: 'Ho Chi Minh City', country: 'Vietnam', iso2: 'VN' });
    expect(homeCity('ZZZ')).toBeNull();
  });
});
