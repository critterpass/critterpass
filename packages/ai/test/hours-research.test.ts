import { describe, expect, it } from 'vitest';

import { checkHoursReply, hoursResearchQuery, timesInText, type WebResult } from '../src';

const NOW = new Date('2026-10-03T12:00:00Z');
const at = (h: number, m = 0) => h * 60 + m;

const page = (snippet: string, published_at: string | null = null): WebResult => ({
  url: 'https://example.jp/hours',
  title: 'Hours',
  snippet,
  published_at,
  fetched_at: NOW.toISOString(),
});

const reply = (weekly: Record<string, { start: string; end: string }[]>, extra = {}) => ({
  decision: 'propose',
  reason: 'stated on the page',
  source_url: 'https://example.jp/hours',
  confidence: 0.9,
  always_open: false,
  weekly: { mo: [], tu: [], we: [], th: [], fr: [], sa: [], su: [], ...weekly },
  ...extra,
});

describe('timesInText', () => {
  it('reads clock times the way pages write them', () => {
    expect(timesInText('Mon 9:00 AM - 6:00 PM')).toEqual(new Set([at(9), at(18)]));
    expect(timesInText('午前８時４５分～午後４時（閉城午後５時）')).toContain(at(17));
    expect(timesInText('午前８時４５分～午後４時')).toContain(at(8, 45));
    expect(timesInText('Mở cửa 8h - 17h30')).toEqual(new Set([at(8), at(20), at(17, 30)]));
    expect(timesInText('11：00〜19：00（L.O）')).toEqual(new Set([at(11), at(19), at(23)]));
    expect(timesInText('open noon to midnight')).toEqual(new Set([at(12), 0]));
  });

  it('does not read prices, years or distances as times', () => {
    expect(timesInText('Admission 1,300 yen, 2026, 3.5 km')).toEqual(new Set());
  });
});

describe('checkHoursReply', () => {
  const results = [page('Hours: 8:45 to 17:00 (entry until 16:00). Closed Tuesdays.')];

  it('keeps a schedule whose every time is written on the cited page', () => {
    const check = checkHoursReply(
      reply({ mo: [{ start: '08:45', end: '17:00' }], we: [{ start: '08:45', end: '17:00' }] }),
      results,
      NOW,
    );
    expect(check).toEqual({
      ok: true,
      proposal: {
        hours: {
          weekly: {
            mo: [{ start: '08:45', end: '17:00' }],
            we: [{ start: '08:45', end: '17:00' }],
          },
        },
        sourceUrl: 'https://example.jp/hours',
        fetchedAt: NOW.toISOString(),
        confidence: 0.9,
      },
    });
  });

  it.each([
    [
      'a time the page never writes',
      reply({ mo: [{ start: '09:00', end: '17:00' }] }),
      'time_not_in_source',
    ],
    [
      'an uncited page',
      reply({ mo: [{ start: '08:45', end: '17:00' }] }, { source_url: 'https://x.test/' }),
      'unknown_source',
    ],
    [
      'low confidence',
      reply({ mo: [{ start: '08:45', end: '17:00' }] }, { confidence: 0.5 }),
      'low_confidence',
    ],
    ['an empty week', reply({}), 'no_hours'],
    ['a zero-length span', reply({ mo: [{ start: '08:45', end: '08:45' }] }), 'bad_span'],
    ['a malformed time', reply({ mo: [{ start: '8.45', end: '17:00' }] }), 'bad_span'],
    ['a decline', reply({}, { decision: 'decline' }), 'declined'],
    [
      'always open without a page saying so',
      reply({}, { always_open: true }),
      'time_not_in_source',
    ],
    ['no JSON at all', undefined, 'shape'],
  ])('rejects %s', (_name, raw, reason) => {
    expect(checkHoursReply(raw, results, NOW)).toEqual({ ok: false, reason });
  });

  it('rejects a page dated more than about a year ago', () => {
    const old = [page('Hours: 8:45 to 17:00', '2025-06-01T00:00:00Z')];
    const raw = reply({ mo: [{ start: '08:45', end: '17:00' }] });
    expect(checkHoursReply(raw, old, NOW)).toEqual({ ok: false, reason: 'stale_source' });
  });

  it('keeps overnight spans and fills every day for a 24-hour place', () => {
    const bar = [page('Open 18:00 - 02:00 daily')];
    const overnight = checkHoursReply(reply({ fr: [{ start: '18:00', end: '02:00' }] }), bar, NOW);
    expect(overnight.ok).toBe(true);

    const shrine = [page('Hours: Always open. Closed: no closing days. Open 24 hours.')];
    const check = checkHoursReply(reply({}, { always_open: true }), shrine, NOW);
    expect(check.ok && Object.keys(check.proposal.hours.weekly)).toEqual([
      'mo',
      'tu',
      'we',
      'th',
      'fr',
      'sa',
      'su',
    ]);
  });
});

describe('hoursResearchQuery', () => {
  it('searches the place names and city, never more than the tool accepts', () => {
    expect(
      hoursResearchQuery({
        name: 'Fushimi Inari Taisha',
        localName: '伏見稲荷大社',
        address: null,
        city: 'Kyoto, Japan',
        category: 'temple_shrine',
      }),
    ).toBe('Fushimi Inari Taisha 伏見稲荷大社 Kyoto opening hours');
    const long = hoursResearchQuery({
      name: 'x'.repeat(400),
      localName: null,
      address: null,
      city: 'Kyoto, Japan',
      category: 'food',
    });
    expect(long.length).toBeLessThanOrEqual(200);
  });
});
