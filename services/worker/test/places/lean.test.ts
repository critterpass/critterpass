/**
 * The lean place rule: which open-data places ingest writes. Travel kinds pass, transit only for
 * hubs by the source's own label, Overture rows only at or above the confidence floor, and an
 * OpenStreetMap sight in any kind with no floor.
 */
import { isLeanPlace, isTransitHub, LEAN_CONFIDENCE_FLOOR, LEAN_KINDS } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { isLeanOvertureRow, type PlaceSourceRow } from '../../src/places/source-readers';

const overture = (category: Parameters<typeof isLeanPlace>[0]['category'], confidence?: number) =>
  isLeanPlace({ category, labels: [], source: 'overture', confidence });

function row(label: string, confidence?: number): PlaceSourceRow {
  return { sourceId: 'ov', name: 'A place', categoryLabels: [label], lat: 0, lng: 0, confidence };
}

describe('the lean place rule', () => {
  it('keeps every travel kind at the floor and drops it under', () => {
    for (const kind of LEAN_KINDS) {
      expect(overture(kind, LEAN_CONFIDENCE_FLOOR)).toBe(true);
      expect(overture(kind, LEAN_CONFIDENCE_FLOOR - 0.01)).toBe(false);
    }
    expect(overture('food')).toBe(false);
  });

  it('drops shopping, health and other from Overture whatever the confidence', () => {
    for (const kind of ['shopping', 'health', 'other'] as const)
      expect(overture(kind, 1)).toBe(false);
  });

  it('keeps transit only for a hub label', () => {
    for (const label of ['airport', 'train_station', 'bus_station', 'ferry_terminal']) {
      expect(isTransitHub([label])).toBe(true);
      expect(
        isLeanPlace({ category: 'transit', labels: [label], source: 'overture', confidence: 0.9 }),
      ).toBe(true);
    }
    for (const tag of [
      'aeroway=aerodrome',
      'railway=station',
      'amenity=bus_station',
      'amenity=ferry_terminal',
    ]) {
      expect(isLeanPlace({ category: 'transit', labels: [tag], source: 'osm' })).toBe(true);
    }
    for (const label of ['bus_stop', 'parking', 'taxi_rank', 'car_rental']) {
      expect(
        isLeanPlace({ category: 'transit', labels: [label], source: 'overture', confidence: 0.9 }),
      ).toBe(false);
    }
    expect(isLeanPlace({ category: 'transit', labels: [], source: 'osm' })).toBe(false);
  });

  it('keeps an OpenStreetMap sight in any kind, with no floor', () => {
    expect(isLeanPlace({ category: 'other', labels: [], source: 'osm' })).toBe(true);
    expect(isLeanPlace({ category: 'nature', labels: [], source: 'osm' })).toBe(true);
  });

  it('reads an Overture row by its labels and confidence', () => {
    expect(isLeanOvertureRow(row('vietnamese_restaurant', 0.8))).toBe(true);
    expect(isLeanOvertureRow(row('airport', 0.7))).toBe(true);
    expect(isLeanOvertureRow(row('bus_stop', 0.9))).toBe(false);
    expect(isLeanOvertureRow(row('pharmacy', 0.9))).toBe(false);
    expect(isLeanOvertureRow(row('cafe', 0.59))).toBe(false);
    expect(isLeanOvertureRow(row('cafe'))).toBe(false);
  });
});
