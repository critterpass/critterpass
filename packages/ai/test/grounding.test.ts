import { describe, expect, it } from 'vitest';

import {
  collectGrounding,
  mergeGrounding,
  unverifiedTextNumbers,
  validateStructured,
} from '../src';

const POI = '0199a000-0000-7000-8000-0000000000a1';
const OTHER_POI = '0199a000-0000-7000-8000-0000000000ff';
const CHANGESET = '0199a000-0000-7000-8000-0000000000c1';

const toolOutputs = [
  [
    {
      poi_id: POI,
      name: 'Hoi An Night Market',
      category: 'market',
      distance_m: 420,
      open_now: true,
      price_level: 1,
      tags: [],
    },
  ],
  {
    offers: [
      {
        offer_ref: 'offer-7',
        supplier: 'viator',
        price_from_minor: 125000,
        currency: 'VND',
        hold_supported: true,
      },
    ],
  },
  {
    status: 'delayed',
    sched: '2026-11-02T18:30:00+07:00',
    est: '2026-11-02T19:45:00+07:00',
    gate: '4',
    source: 'aerodatabox',
    at: '2026-11-02T15:00:00+07:00',
  },
  {
    changeset_id: CHANGESET,
    violations: [],
    cost_delta: { delta_per_person_minor: 1250, currency: 'USD' },
  },
];
const grounding = collectGrounding(toolOutputs);

describe('structured output grounding', () => {
  it('accepts ids, prices and times the tools returned', () => {
    const output = {
      picks: [{ poi_id: POI, price_from_minor: 125000, source_ids: [POI, 'offer-7'] }],
      changeset_id: CHANGESET,
      leave_at: '2026-11-02T19:45:00+07:00',
      delta_per_person_minor: 1250,
    };
    expect(validateStructured(output, grounding)).toEqual([]);
  });

  it('rejects an invented poi_id, an invented price and an invented time', () => {
    const output = {
      picks: [{ poi_id: OTHER_POI, price_from_minor: 99000 }],
      leave_at: '2026-11-02T20:10:00+07:00',
    };
    expect(validateStructured(output, grounding)).toEqual([
      { kind: 'unknown_id', path: 'picks[0].poi_id', value: OTHER_POI },
      { kind: 'unverified_number', path: 'picks[0].price_from_minor', value: 99000 },
      { kind: 'unverified_time', path: 'leave_at', value: '2026-11-02T20:10:00+07:00' },
    ]);
  });

  it('checks every id inside source_ids', () => {
    expect(validateStructured({ source_ids: ['made-up'] }, grounding)).toEqual([
      { kind: 'unknown_id', path: 'source_ids[0]', value: 'made-up' },
    ]);
  });

  it('merges other grounded sources such as the trip context', () => {
    const merged = mergeGrounding(grounding, collectGrounding([{ trip_id: 'trip-1' }]));
    expect(validateStructured({ trip_id: 'trip-1' }, merged)).toEqual([]);
  });
});

describe('free-text grounding', () => {
  it('passes prices and times worded from tool output, and small counts', () => {
    const text =
      'Your flight now leaves at 7:45pm, about $12.50 more each; the market is 420 m away and 125.000 ₫ covers 2 people.';
    expect(unverifiedTextNumbers(text, grounding)).toEqual([]);
  });

  it('flags numbers, times and ids no tool produced', () => {
    const text = `Boats run until 23:00 and cost 350,000 each. Try ${OTHER_POI}.`;
    expect(unverifiedTextNumbers(text, grounding)).toEqual([
      { kind: 'unverified_time', path: 'text', value: '23:00' },
      { kind: 'unverified_number', path: 'text', value: '350,000' },
      { kind: 'unknown_id', path: 'text', value: OTHER_POI },
    ]);
  });
});
