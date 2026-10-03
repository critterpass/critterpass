import type { RecapContent } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  formatRecapMoney,
  recapCopyAwards,
  recapCopyFacts,
  recapDateRange,
  templateRecapCopy,
  validateRecapCopy,
  writeRecapCopy,
  type RecapCopyInput,
  type RecapCopyReply,
} from '../src/routes/recap';

const ANNA = '0199a000-0000-7000-8000-00000000000a';
const BEN = '0199a000-0000-7000-8000-00000000000b';
const CORA = '0199a000-0000-7000-8000-00000000000c';
const POI = '0199a000-0000-7000-8000-0000000000f1';

const content: Pick<RecapContent, 'stats' | 'route' | 'receipt' | 'got_away'> = {
  stats: {
    start_date: '2026-10-02',
    end_date: '2026-10-04',
    days: 3,
    travellers: 3,
    distance_m: 61_700,
    distance_estimated: true,
    superlatives: [],
    photos: null,
    critters: { forms_found: 2, new_critters: 1, form_ids: [] },
    best_day: { day_no: 2, local_date: '2026-10-03', score: 7 },
  },
  route: {
    stops: [
      {
        poi_id: POI,
        name: 'Marble Mountains',
        category: 'nature',
        day_from: 1,
        day_to: 1,
        local_time: '04:30',
        before_sunrise: true,
      },
      {
        poi_id: POI,
        name: 'Ba Na Hills',
        category: 'nature',
        day_from: 2,
        day_to: 2,
        local_time: '08:00',
        before_sunrise: false,
      },
    ],
    legs: [{ from: 0, to: 1, distance_m: 61_700, minutes: 70, estimate: true, ride: null }],
    total_m: 61_700,
    estimated: true,
    longest_leg: 0,
    ridden_m: 0,
    rides: 0,
    top_driver: null,
  },
  receipt: {
    currency: 'VND',
    lines: [{ category: 'food', total_minor: 1_000_000, count: 2 }],
    total_minor: 1_000_000,
    expenses: 2,
    meals: 2,
    travellers: 3,
    each_minor: 333_333,
    planned_each_minor: null,
    planned_total_minor: null,
    under_minor: null,
    priciest: null,
    cheapest_day: null,
    outstanding_minor: 0,
    settled: true,
    settled_on: null,
    settled_days_after_end: null,
  },
  got_away: {
    form_id: POI,
    critter_id: POI,
    critter_key: 'cp-803',
    rarity: 'legendary',
    sightings: 2,
    wandered_off: 1,
    seen_by: [CORA],
    forms_found: 1,
    forms_total: 4,
    next_window: { from: '2027-05-01', to: '2027-09-30' },
  },
};

const names = new Map([
  [ANNA, 'Anna Lee'],
  [BEN, 'Ben'],
  [CORA, 'Cora Diaz'],
]);

const input: RecapCopyInput = {
  guide: 'tokek',
  cards: ['cover', 'route', 'awards', 'receipt', 'got_away'],
  facts: recapCopyFacts(content, { place: 'Da Nang', crew: 'The Six', names }),
  awards: recapCopyAwards(
    [
      {
        user_id: ANNA,
        kind: 'early_riser',
        metric: 'early_starts',
        value: 2,
        evidence: { earliest_time: '04:00', crew_total: 3, share_pct: 67 },
      },
      { user_id: BEN, kind: 'good_company', metric: 'none', value: 0, evidence: {} },
    ],
    names,
  ),
};

/** The template copy, as if the model had answered it. */
function templateReply(): RecapCopyReply {
  const copy = templateRecapCopy(input);
  return {
    cards: Object.fromEntries(
      Object.entries(copy.cards).flatMap(([card, words]) =>
        words === undefined ? [] : [[card, words]],
      ),
    ),
    awards: copy.awards.map((award) => ({ ...award })),
  };
}

describe('recap facts', () => {
  it('formats amounts in the currency’s own exponent, dates as a range, km to one decimal', () => {
    expect(formatRecapMoney(5_700_000, 'VND')).toBe('VND 5,700,000');
    expect(formatRecapMoney(46_000, 'USD')).toBe('USD 460');
    expect(formatRecapMoney(1_250, 'USD')).toBe('USD 12.50');
    expect(recapDateRange('2026-10-02', '2026-10-04')).toBe('2–4 Oct 2026');
    expect(recapDateRange('2026-09-30', '2026-10-03')).toBe('30 Sep – 3 Oct 2026');
    expect(input.facts.route).toMatchObject({ km: 61.7, estimated: true });
    expect(input.facts.got_away).toMatchObject({
      missed_by: ['Cora'],
      comes_back: 'May to September',
    });
    expect(input.awards[0]).toMatchObject({ name: 'Anna', value: 2 });
  });
});

describe('the recap number guard', () => {
  it('passes the template copy, which only quotes the facts', () => {
    expect(validateRecapCopy(templateReply(), input)).toMatchObject({ ok: true });
  });

  it('rejects a number the facts do not hold', () => {
    const reply = templateReply();
    reply.cards['route'] = { narration: 'About 62 km of road, give or take.' };
    expect(validateRecapCopy(reply, input)).toMatchObject({
      ok: false,
      reason: 'ungrounded:route:62',
    });
  });

  it('counts number words as numbers: "twice" passes on a 2, "twelve" never does', () => {
    const reply = templateReply();
    reply.awards[0] = { user_id: ANNA, title: 'Earliest riser', line: 'Up before dawn twice.' };
    expect(validateRecapCopy(reply, input)).toMatchObject({ ok: true });
    reply.awards[0] = { user_id: ANNA, title: 'Earliest riser', line: 'Up twelve times at dawn.' };
    expect(validateRecapCopy(reply, input)).toMatchObject({
      ok: false,
      reason: 'ungrounded:award:early_riser:twelve',
    });
  });

  it('holds award and got-away lines to the tone rules', () => {
    const reply = templateReply();
    reply.awards[1] = { user_id: BEN, title: 'Good company', line: 'Never late, never drunk.' };
    expect(validateRecapCopy(reply, input)).toMatchObject({ ok: false });
    const slept = templateReply();
    slept.cards['got_away'] = { narration: 'Cora was hungover for the summit.' };
    expect(validateRecapCopy(slept, input)).toMatchObject({
      ok: false,
      reason: 'tone:got_away:hungover',
    });
  });

  it('needs every card asked for and exactly one line per award', () => {
    const missing = templateReply();
    delete missing.cards['receipt'];
    expect(validateRecapCopy(missing, input)).toMatchObject({
      ok: false,
      reason: 'missing_card:receipt',
    });
    const short = templateReply();
    short.awards.pop();
    expect(validateRecapCopy(short, input)).toMatchObject({
      ok: false,
      reason: `missing_award:${BEN}`,
    });
  });

  it('keeps the cards that passed and gives the template only the one that slipped', async () => {
    const reply = templateReply();
    reply.cards['cover'] = {
      narration: 'Da Nang, The Six, back home already.',
      headline: 'Da Nang',
    };
    reply.cards['route'] = { narration: 'About 62 km of road.' };
    const result = await writeRecapCopy(
      {
        callModel: () =>
          Promise.resolve({
            message: { content: [{ type: 'text', text: JSON.stringify(reply) }] },
          }) as never,
      },
      input,
    );
    expect(result).toMatchObject({ fallbackUsed: true, rejected: 'ungrounded:route:62' });
    expect(result.cards.cover?.narration).toBe('Da Nang, The Six, back home already.');
    expect(result.cards.route?.narration).toBe('About 61.7 km, 2 stops, one crew.');
  });

  it('never reads a name as a tone slip', () => {
    const named: RecapCopyInput = {
      ...input,
      facts: { ...input.facts, people: ['Beer', 'Ben'] },
      awards: input.awards.map((award) =>
        award.user_id === BEN ? { ...award, name: 'Beer' } : award,
      ),
    };
    const reply = templateReply();
    reply.awards[1] = {
      user_id: BEN,
      title: 'Good company',
      line: 'Beer came along for all of it.',
    };
    expect(validateRecapCopy(reply, named)).toMatchObject({ ok: true });
  });

  it('falls back to the template when the call fails', async () => {
    const result = await writeRecapCopy(
      { callModel: () => Promise.reject(new Error('network down')) },
      input,
    );
    expect(result).toMatchObject({ fallbackUsed: true, rejected: 'call_failed' });
    expect(result.cards.route?.narration).toBe('About 61.7 km, 2 stops, one crew.');
  });
});
