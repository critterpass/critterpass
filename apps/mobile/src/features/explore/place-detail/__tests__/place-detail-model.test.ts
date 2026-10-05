/**
 * The place page's button always says where the place would go: the fit's best day and time for
 * the organiser ("Add to Sat · 08:00"), a suggestion for a member, the day and time once it is in
 * the plan; and the planning fields a server sends are read without breaking on ones this build
 * does not know.
 */
import { i18n as lingui } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { readPlaceDetail, type PlaceDetailContext } from '../context';
import { ctaLabel, detailCta, fitSentence } from '../model';

beforeAll(() => {
  lingui.loadAndActivate({ locale: 'en', messages: {} });
});

const SAT = '0192f000-0000-7000-8000-0000000000d6';
const THU = '0192f000-0000-7000-8000-0000000000d4';
const SPRINGS = '0192f000-0000-7000-8000-0000000000e1';

const wire = {
  poi_id: 'p1',
  trip_id: 't1',
  stay: null,
  crowd: null,
  crew: { saved_by: [], yes_by: [] },
  qna: null,
  in_plan: null,
  suggested_slot: null,
  add_mode: 'apply',
  base_version: 'v1',
  from_stay: { name: 'the villa', minutes: 45, mode: 'drive', approx: true },
  when_it_fits: {
    best: {
      day_id: SAT,
      day_no: 3,
      date: '2026-10-17',
      start: '08:00',
      end: '09:30',
      starts_at: '2026-10-17T00:00:00.000Z',
      ends_at: '2026-10-17T01:30:00.000Z',
      grade: 'good',
      reasons: [
        { code: 'free_day', params: { day_no: 3 } },
        { code: 'busy_from', params: { time: '10:00', level: 90, source: 'editorial' } },
        { code: 'a_code_from_a_newer_server', params: {} },
      ],
    },
    other_best: {
      day_id: THU,
      day_no: 1,
      date: '2026-10-15',
      start: '13:00',
      end: '14:30',
      starts_at: '2026-10-15T05:00:00.000Z',
      ends_at: '2026-10-15T06:30:00.000Z',
      grade: 'good',
      reasons: [{ code: 'after_item', params: { stable_id: SPRINGS } }],
    },
    days: [],
    bars: { from: 8, to: 17, hourly: null, lit: { from: 8, to: 10 } },
  },
  facts: { open_spans: [{ from: '08:00', to: '17:00' }], hours_known: true, entry: 'RP 75K' },
  know: [{ title: 'Sarongs are lent at the gate' }, { detail: 'no title' }],
  nearby: [],
  similar: [],
  split: null,
};

const read = (patch: Record<string, unknown> = {}): PlaceDetailContext => {
  const parsed = readPlaceDetail({ ...wire, ...patch });
  if (parsed === null) throw new Error('context did not parse');
  return parsed;
};

const cta = (context: PlaceDetailContext | null, addedDay: number | null = null) =>
  detailCta({ context, status: 'ready', tz: 'Asia/Makassar', locale: 'en', addedDay });

describe('place detail CTA', () => {
  it('names the best day and time, as an add for the organiser', () => {
    expect(ctaLabel(cta(read()))).toBe('Add to Sat · 08:00');
  });

  it('suggests for a member, since the crew okays it', () => {
    expect(ctaLabel(cta(read({ add_mode: 'changeset' })))).toBe('Suggest for Sat · 08:00');
  });

  it('says where it already is once it is in the plan', () => {
    const inPlan = read({
      in_plan: { day_no: 3, stable_id: 's1', starts_at: '2026-10-17T00:00:00.000Z' },
    });
    expect(ctaLabel(cta(inPlan))).toBe('In day 3 · 08:00');
    expect(ctaLabel(cta(read(), 2))).toBe('In day 2');
  });

  it('has nothing to add without a plan or a fit', () => {
    expect(cta(read({ base_version: null })).kind).toBe('noPlan');
    // An organiser's own draft, before the crew has a plan, takes the place like any plan.
    const draft = read({ base_version: null, plan_version: { id: 'draft-1', kind: 'draft' } });
    expect(ctaLabel(cta(draft))).toBe('Add to Sat · 08:00');
    expect(cta(read({ when_it_fits: null })).kind).toBe('noFit');
  });
});

describe('place detail context', () => {
  it('keeps known reasons and facts and drops what it does not know', () => {
    const context = read();
    expect(context.fits?.best?.reasons.map((r) => r.code)).toEqual(['free_day', 'busy_from']);
    expect(context.facts).toMatchObject({ entry: 'RP 75K', dress: null, takesMin: null });
    expect(context.know).toEqual([{ title: 'Sarongs are lent at the gate', detail: null }]);
    expect(readPlaceDetail({ ...wire, when_it_fits: 'nonsense', nearby: 4 })?.fits).toBeNull();
  });

  it('words why in two clauses and the next best day', () => {
    const context = read();
    const sentence = fitSentence(context.fits, {
      locale: 'en',
      stopName: (id) => (id === SPRINGS ? 'the springs' : null),
    });
    expect(sentence).toBe(
      'Your free day, and it usually gets busy around 10. Thursday after the springs works too.',
    );
  });
});
