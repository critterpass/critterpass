import { describe, expect, it } from '@jest/globals';
import type { RedraftChange, RedraftItemSnapshot } from '@cp/domain';

import {
  changeCards,
  excludedIds,
  metricChips,
  partialKeepClashes,
  redraftPhase,
  truthfulReason,
} from '../data/redraft';

const PLACES = {
  nara: { name: 'Nara Park', category: 'park', lat: 0, lng: 0, editorial: true },
  path: { name: 'Philosopher’s Path', category: 'walk', lat: 0, lng: 0, editorial: true },
  boat: { name: 'Canal boat', category: 'activity', lat: 0, lng: 0, editorial: true },
  lunch: { name: 'Lunch in Nara', category: 'food', lat: 0, lng: 0, editorial: true },
  tea: { name: 'Tea house', category: 'food', lat: 0, lng: 0, editorial: true },
  temple: { name: 'Temple', category: 'sight', lat: 0, lng: 0, editorial: true },
};

function snap(poi: string, time: string): RedraftItemSnapshot {
  const at = `2027-04-05T${time}:00+09:00`;
  return { poi_id: poi, kind: 'activity', starts_at: at, ends_at: at, amount_minor: 0 };
}

const change = (
  op: RedraftChange['op'],
  id: string,
  before: RedraftItemSnapshot | null,
  after: RedraftItemSnapshot | null,
  reason: string | null = null,
): RedraftChange => ({ op, stable_id: id, before, after, reason });

describe('redraft change cards', () => {
  it('pairs stops taken out with stops put in, in time order, as one card each', () => {
    const cards = changeCards(
      [
        change('add', 'b', null, snap('boat', '12:30'), 'Under the cherry trees.'),
        change('remove', 'x', snap('nara', '09:12'), null),
        change('remove', 'y', snap('lunch', '12:30'), null),
        change('add', 'a', null, snap('path', '09:00'), 'On foot.'),
      ],
      PLACES,
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      kind: 'change',
      stableIds: ['x', 'a'],
      before: { name: 'Nara Park' },
      after: { name: 'Philosopher’s Path' },
      reason: 'On foot.',
    });
    expect(cards[1]).toMatchObject({ stableIds: ['y', 'b'], after: { name: 'Canal boat' } });
  });

  it('leaves an unmatched removal as its own card and keeps swaps and big retimes whole', () => {
    const cards = changeCards(
      [
        change('remove', 'x', snap('nara', '17:40'), null, 'A free evening.'),
        change('swap', 's', snap('tea', '15:00'), snap('temple', '15:00')),
        change('retime', 'r', snap('boat', '10:00'), snap('boat', '11:30')),
      ],
      PLACES,
    );
    expect(cards.map((card) => card.key)).toEqual(['r', 's', 'x']);
    expect(cards[2]).toMatchObject({ after: null, reason: 'A free evening.' });
  });

  it('folds two or more small time shifts into one summary card, but not a single one', () => {
    const shifts = [
      change('retime', 't1', snap('tea', '15:00'), snap('tea', '15:20')),
      change('retime', 't2', snap('boat', '16:00'), snap('boat', '16:15')),
    ];
    const folded = changeCards(shifts, PLACES);
    expect(folded).toEqual([
      { kind: 'shifts', key: 'shifts', stableIds: ['t1', 't2'], count: 2, maxMin: 20 },
    ]);
    const single = changeCards(shifts.slice(0, 1), PLACES);
    expect(single[0]?.kind).toBe('change');
  });

  it('keeps every stable id of a card toggled off', () => {
    const cards = changeCards(
      [
        change('remove', 'x', snap('nara', '09:12'), null),
        change('add', 'a', null, snap('path', '09:00')),
        change('swap', 's', snap('tea', '15:00'), snap('temple', '15:00')),
      ],
      PLACES,
    );
    expect(excludedIds(cards, new Set(['x+a']))).toEqual(['x', 'a']);
    expect(excludedIds(cards, new Set())).toEqual([]);
  });
});

describe('truthful redraft reasons', () => {
  it('drops sentences claiming a booking or hold and keeps the rest', () => {
    expect(truthfulReason('Twenty-five minutes under the cherry trees. I booked it.')).toBe(
      'Twenty-five minutes under the cherry trees.',
    );
    expect(truthfulReason('We’ve reserved a table! Great ramen.')).toBe('Great ramen.');
    expect(truthfulReason('I held two rooms.')).toBeNull();
    expect(truthfulReason('A booked-out spot, so I picked another.')).toBe(
      'A booked-out spot, so I picked another.',
    );
  });
});

describe('redraft metric chips', () => {
  const base = {
    transit_delta_min: -90,
    active_delta_min: 0,
    pace: 'same' as const,
    must_dos_kept: 5,
    must_dos_total: 5,
    cost_delta_pp_minor: 0,
    currency: 'USD',
  };

  it('shows cost only when it moved and must-dos only when the trip has any', () => {
    expect(metricChips(base).map((chip) => chip.kind)).toEqual(['transit', 'pace', 'must_dos']);
    expect(
      metricChips({ ...base, must_dos_total: 0, must_dos_kept: 0, cost_delta_pp_minor: -1500 }).map(
        (chip) => chip.kind,
      ),
    ).toEqual(['transit', 'pace', 'cost']);
    expect(metricChips(null)).toEqual([]);
  });
});

describe('the redraft screen phase', () => {
  const at = (overrides: Partial<Parameters<typeof redraftPhase>[0]>) =>
    redraftPhase({ status: 'running', outcome: null, settled: null, beatDone: true, ...overrides });

  it('thinks until the job delivers and the beat has run', () => {
    expect(at({})).toBe('thinking');
    expect(at({ status: 'succeeded', outcome: 'changed', beatDone: false })).toBe('thinking');
    expect(at({ status: 'succeeded', outcome: 'changed' })).toBe('ready');
  });

  it('says the day could not be beaten, or that the redraft failed, when its unit came back', () => {
    expect(at({ status: 'succeeded', outcome: 'identical', settled: 'released' })).toBe(
      'identical',
    );
    expect(at({ status: 'failed', settled: 'released' })).toBe('failed');
    expect(at({ status: 'running', settled: 'released' })).toBe('failed');
  });

  it('shows a redraft already kept or put back as settled', () => {
    expect(at({ status: 'succeeded', outcome: 'changed', settled: 'committed' })).toBe('settled');
  });
});

describe('keeping only some of a redraft', () => {
  const span = (poi: string, from: string, to: string): RedraftItemSnapshot => ({
    poi_id: poi,
    kind: 'activity',
    starts_at: `2027-04-05T${from}:00+09:00`,
    ends_at: `2027-04-05T${to}:00+09:00`,
    amount_minor: 0,
  });
  // The palace goes, and the college moves up into its morning slot.
  const changes = [
    change('remove', 'palace', span('nara', '10:00', '12:00'), null),
    change('retime', 'college', span('temple', '12:30', '14:00'), span('temple', '10:00', '11:30')),
    change('add', 'coffee', null, span('tea', '13:30', '14:45')),
  ];

  it('is fine as a whole, and with a change left out that touches nothing else', () => {
    expect(partialKeepClashes(changes, [])).toBe(false);
    expect(partialKeepClashes(changes, ['coffee'])).toBe(false);
  });

  it('clashes when a stop kept in its old slot meets one moved into it', () => {
    expect(partialKeepClashes(changes, ['palace'])).toBe(true);
  });

  it('clashes when a stop left at its old time meets one put in there', () => {
    expect(partialKeepClashes(changes, ['college'])).toBe(true);
  });

  it('reads a translated reason where one has synced', () => {
    const cards = changeCards(
      [change('add', 'coffee', null, span('tea', '13:30', '14:45'), 'A slow pour.')],
      PLACES,
      new Map([['coffee', 'Một ly pha chậm.']]),
    );
    expect(cards[0]).toMatchObject({ reason: 'Một ly pha chậm.' });
  });
});
