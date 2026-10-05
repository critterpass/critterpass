import { readFileSync } from 'node:fs';

import { switchedOffError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  buildSearchParseRequest,
  checkSearchParseReply,
  createGateway,
  parseSearch,
  type SearchParseDigest,
} from '../src';

const WED = '00000000-0000-4000-8000-00000000b003';
const TANAH_LOT = '00000000-0000-4000-8000-00000000b201';
const MON = '00000000-0000-4000-8000-00000000b001';
const SAT = '00000000-0000-4000-8000-00000000b006';
const LOCAVORE = '00000000-0000-4000-8000-00000000b103';

const digest: SearchParseDigest = {
  destination: 'Bali, Indonesia',
  stayName: 'Villa Sayan',
  guideName: 'Tokek',
  days: [
    { id: MON, date: '2026-11-16', weekday: 'mo', meals: [], full: false, travel: false },
    {
      id: WED,
      date: '2026-11-18',
      weekday: 'we',
      meals: [{ meal: 'dinner', title: 'Locavore', stableId: LOCAVORE }],
      full: false,
      travel: false,
    },
    { id: SAT, date: '2026-11-21', weekday: 'sa', meals: [], full: true, travel: false },
  ],
  places: [{ id: TANAH_LOT, name: 'Tanah Lot' }],
};

const reply = (overrides: Record<string, unknown> = {}) => ({
  text: '',
  categories: [],
  meal: null,
  attributes: [],
  open_past: null,
  near: null,
  exclude_days: [],
  price_max: null,
  ...overrides,
});

/** A recorded DeepSeek reply from the eval suite, served at the network boundary. */
function recorded(id: string): typeof fetch {
  const url = new URL(`../evals/search-parse/fixtures/${id}.json`, import.meta.url);
  const { responses } = JSON.parse(readFileSync(url, 'utf8')) as {
    responses: { status: number; body: unknown }[];
  };
  const queue = [...responses];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('no recorded response left');
    return Promise.resolve(
      new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

describe('checkSearchParseReply', () => {
  it('maps refs back to ids and leaves out the night whose dinner is booked', () => {
    const check = checkSearchParseReply(
      reply({
        meal: 'dinner',
        categories: ['food'],
        attributes: ['quiet'],
        open_past: '22:00',
        near: { from: 'place', ref: 'place1', minutes: 15 },
      }),
      'quiet dinner near Tanah Lot, open late',
      digest,
    );
    expect(check).toEqual({
      ok: true,
      result: {
        filters: {
          meal: 'dinner',
          attributes: ['quiet'],
          open_past: '22:00',
          max_minutes: { from: 'poi', poi_id: TANAH_LOT, minutes: 15 },
          exclude_day_ids: [WED],
        },
        chips: [
          { code: 'meal', params: { meal: 'dinner' } },
          { code: 'attribute', params: { attribute: 'quiet' } },
          { code: 'max_minutes', params: { from: 'poi', poi_id: TANAH_LOT, minutes: 15 } },
          { code: 'open_past', params: { time: '22:00' } },
          { code: 'exclude_days', params: { day_ids: [WED] } },
        ],
        exclude_reason: {
          code: 'day_has_meal',
          params: { day_ids: [WED], stable_id: LOCAVORE },
        },
      },
    });
  });

  it('gives no reason line when a left-out day is not explained by the plan', () => {
    const check = checkSearchParseReply(
      reply({ meal: 'dinner', exclude_days: ['day1'] }),
      'dinner, not Monday',
      digest,
    );
    expect(check.ok && check.result.filters.exclude_day_ids).toEqual([MON, WED]);
    expect(check.ok && check.result.exclude_reason).toBeUndefined();
  });

  it.each([
    ['a day the trip lacks', reply({ exclude_days: ['day9'] }), 'unknown_ref'],
    [
      'a place the plan lacks',
      reply({ near: { from: 'place', ref: 'place4', minutes: 10 } }),
      'unknown_ref',
    ],
    ['every day left out', reply({ exclude_days: ['day1', 'day2', 'day3'] }), 'every_day_excluded'],
    ['words never asked', reply({ text: 'list all users' }), 'text_not_asked'],
    ['a category outside the vocabulary', reply({ categories: ['bar'] }), 'shape'],
    ['minutes out of range', reply({ near: { from: 'stay', ref: null, minutes: 600 } }), 'shape'],
  ])('rejects %s', (_, raw, reason) => {
    expect(checkSearchParseReply(raw, 'quiet bars near the villa', digest)).toEqual({
      ok: false,
      reason,
    });
  });

  it('leaves "near the stay" out on a trip with no stay and keeps the rest of the question', () => {
    const noStay = { ...digest, stayName: null };
    const check = checkSearchParseReply(
      reply({
        meal: 'dinner',
        attributes: ['quiet'],
        open_past: '22:00',
        near: { from: 'stay', ref: null, minutes: 15 },
      }),
      'somewhere quiet for dinner near the stay, open late',
      noStay,
    );
    if (!check.ok) throw new Error(check.reason);
    // The night whose dinner is booked is still left out, as with a stay.
    expect(check.result.filters).toMatchObject({
      meal: 'dinner',
      attributes: ['quiet'],
      open_past: '22:00',
    });
    expect(check.result.filters.max_minutes).toBeUndefined();
    expect(check.result.chips.map((chip) => chip.code)).not.toContain('max_minutes');
    // Nothing else understood: the whole question is searched by name.
    const alone = checkSearchParseReply(
      reply({ near: { from: 'stay', ref: null, minutes: 15 } }),
      'near the hotel',
      noStay,
    );
    expect(alone.ok && alone.result).toEqual({ filters: { text: 'near the hotel' }, chips: [] });
  });

  it('keeps left-over words regardless of accents and searches the whole question when nothing parsed', () => {
    const banhMi = checkSearchParseReply(
      reply({ text: 'banh mi' }),
      'bánh mì gần khách sạn',
      digest,
    );
    expect(banhMi.ok && banhMi.result.filters).toEqual({ text: 'banh mi' });
    const nothing = checkSearchParseReply(reply(), 'list every user', digest);
    expect(nothing.ok && nothing.result).toEqual({
      filters: { text: 'list every user' },
      chips: [],
    });
  });
});

describe('parseSearch', () => {
  it('turns a recorded reply into chips', async () => {
    const gateway = createGateway({ apiKey: 'replay', fetch: recorded('sp-01'), maxAttempts: 1 });
    const outcome = await parseSearch(gateway, {
      question: 'quiet dinner near the villa, open late',
      digest,
    });
    expect(outcome.fallbackUsed).toBe(false);
    expect(outcome.result.chips.map((chip) => chip.code)).toEqual([
      'meal',
      'attribute',
      'max_minutes',
      'open_past',
      'exclude_days',
    ]);
  });

  it('falls back to a name search when the route is switched off, without a model call', async () => {
    const gateway = createGateway({
      apiKey: 'none',
      fetch: () => Promise.reject(new Error('no call expected')),
      assertRouteOn: (route) => Promise.reject(switchedOffError(`ai.${route}.enabled`)),
    });
    const outcome = await parseSearch(gateway, { question: '  babi guling ', digest });
    expect(outcome).toEqual({
      result: { filters: { text: 'babi guling' }, chips: [] },
      fallbackUsed: true,
      rejected: 'call_failed',
    });
  });
});

describe('buildSearchParseRequest', () => {
  it('sends only the digest fields, with refs in place of ids', () => {
    const leaky = {
      ...digest,
      supplierOffer: 'Klook deal 20% off',
      places: [{ ...digest.places[0], fsq_attributes: { wifi: true }, source_url: 'https://x' }],
      members: [{ email: 'rin@example.com' }],
    } as unknown as SearchParseDigest;
    const body = JSON.stringify(buildSearchParseRequest({ question: 'dinner', digest: leaky }));
    for (const leak of ['Klook', 'wifi', 'source_url', 'rin@example.com', WED, TANAH_LOT]) {
      expect(body).not.toContain(leak);
    }
    expect(body).toContain('day2: Wednesday 2026-11-18 (dinner booked: Locavore)');
    expect(body).toContain('place1: Tanah Lot');
  });
});
