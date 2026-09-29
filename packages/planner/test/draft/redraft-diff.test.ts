import type { DraftDay, DraftItem, Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  alignStableIds,
  instantAt,
  metricChipLabels,
  redraftDiff,
  redraftMetrics,
} from '../../src/draft/index';
import { P, REQUIRED, itinerary, uuid } from './kyoto-fixture';

const DATE = '2026-11-03';
const hm = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return instantAt(DATE, h * 60 + m, 'Asia/Tokyo').toISOString();
};

function item(
  stableId: string,
  poiId: string,
  start: string,
  end: string,
  travel: number,
  mustDoId: string | null = null,
  note: string | null = null,
): DraftItem {
  return {
    stable_id: stableId,
    kind: poiId === P.ramen.id ? 'meal' : 'activity',
    poi_id: poiId,
    starts_at: hm(start),
    ends_at: hm(end),
    tz: 'Asia/Tokyo',
    must_do_id: mustDoId,
    booking_id: null,
    locked_reason: mustDoId === null ? null : 'must_do',
    cost_model: 'per_person',
    amount_minor: 2000,
    currency: 'USD',
    travel_min: travel,
    note,
  };
}

const day = (items: DraftItem[]): DraftDay => ({ day_no: 2, date: DATE, theme: 'Day 2', items });

const BASE = day([
  item(uuid(1), P.fushimi.id, '09:00', '10:30', 0, uuid(501)),
  item(uuid(2), P.museum.id, '11:30', '13:00', 60),
  item(uuid(3), P.ramen.id, '14:00', '15:15', 60),
  item(uuid(4), P.kinkakuji.id, '15:45', '17:15', 30, uuid(502)),
  item(uuid(5), P.nishiki.id, '17:45', '19:15', 30, uuid(503)),
]);

/** The guide's new day: fresh ids straight from the scheduler. */
const CANDIDATE = day([
  item(uuid(11), P.fushimi.id, '09:00', '10:30', 0, uuid(501)),
  item(uuid(12), P.gion.id, '10:45', '12:15', 15, null, 'Gion is a short walk, no train.'),
  item(uuid(13), P.ramen.id, '12:30', '13:45', 15, null, 'Lunch right after, at noon.'),
  item(uuid(14), P.kinkakuji.id, '14:15', '15:45', 30, uuid(502), 'Earlier, before the crowds.'),
  item(uuid(15), P.nishiki.id, '17:45', '19:15', 30, uuid(503)),
]);

describe('redraftDiff', () => {
  it('turns a redrafted day into three changes on stable ids with deterministic chips', () => {
    const aligned = alignStableIds(BASE, CANDIDATE);
    expect(aligned.items.map((i) => i.stable_id)).toEqual([1, 2, 3, 4, 5].map(uuid));
    const changes = redraftDiff(BASE, aligned);
    expect(changes.map((c) => [c.op, c.stable_id])).toEqual([
      ['swap', uuid(2)],
      ['retime', uuid(3)],
      ['retime', uuid(4)],
    ]);
    expect(changes[0]?.before?.poi_id).toBe(P.museum.id);
    expect(changes[0]?.after?.poi_id).toBe(P.gion.id);
    expect(changes[0]?.reason).toBe('Gion is a short walk, no train.');

    const trip = itinerary();
    const candidateTrip: Itinerary = {
      ...trip,
      days: trip.days.map((d) => (d.day_no === 2 ? aligned : d)),
    };
    const metrics = redraftMetrics({
      base: BASE,
      candidate: aligned,
      candidateItinerary: candidateTrip,
      requiredMustDoIds: REQUIRED,
      crewSize: 4,
      currency: 'USD',
    });
    expect(metricChipLabels(metrics).join(' · ')).toBe(
      '90 MIN LESS ON TRAINS · SAME PACE · ALL 5 MUST-DOS KEPT',
    );
  });

  it('reports an unchanged day as no changes, and a dropped stop as a removal', () => {
    expect(redraftDiff(BASE, alignStableIds(BASE, BASE))).toEqual([]);
    const shorter = day(CANDIDATE.items.filter((i) => i.poi_id !== P.gion.id));
    const changes = redraftDiff(BASE, alignStableIds(BASE, shorter));
    expect(changes.filter((c) => c.op === 'remove').map((c) => c.stable_id)).toEqual([uuid(2)]);
  });
});
