/**
 * A day's legs read the stored leg for each pair of stops, and estimate the rest in a straight
 * line: walking when the stops are close, driving otherwise, always marked "about". A stored road
 * shape decodes to the path the maps draw.
 */
import { encodePolyline, PLAN_LEG_SHAPE_PRECISION, type LngLat } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { dayLegs, WALK_MAX_M, type LegEnd, type StoredLeg } from '../day-legs';
import { legPathsByPair } from '../version-leg-paths';

const STAY: LegEnd = { key: 'stay', lat: -8.515, lng: 115.258 };
const RIDGE: LegEnd = { key: 'ridge', lat: -8.5031, lng: 115.2543 };
const SPA: LegEnd = { key: 'spa', lat: -8.5025, lng: 115.2547 };

const stored: StoredLeg = {
  from_key: 'stay',
  to_key: 'ridge',
  mode: 'drive',
  minutes: 12,
  meters: 2100,
  source: 'valhalla',
  approx: 0,
};

describe('dayLegs', () => {
  it('reads the stored leg where the plan has one', () => {
    const [first] = dayLegs([STAY, RIDGE], [stored]);
    expect(first).toEqual({
      from: 'stay',
      to: 'ridge',
      mode: 'drive',
      minutes: 12,
      meters: 2100,
      source: 'valhalla',
      approx: false,
      path: null,
    });
  });

  it('estimates the rest: a short hop on foot, a long one by car, both marked about', () => {
    const [, short, back] = dayLegs([STAY, RIDGE, SPA, STAY], [stored]);
    expect(short).toMatchObject({ from: 'ridge', to: 'spa', mode: 'walk', approx: true });
    expect(short?.source).toBe('straight_line');
    expect(short?.meters).toBeLessThanOrEqual(WALK_MAX_M);
    expect(back).toMatchObject({ from: 'spa', to: 'stay', mode: 'drive', approx: true });
  });

  it('falls back to an estimate for a stored leg in a mode the app does not know', () => {
    const [leg] = dayLegs([STAY, RIDGE], [{ ...stored, mode: 'hovercraft' }]);
    expect(leg?.source).toBe('straight_line');
    expect(dayLegs([STAY], [])).toEqual([]);
  });

  it('decodes the stored road shape into a path, and keeps none for an estimate', () => {
    const road: LngLat[] = [
      [115.258, -8.515],
      [115.2561, -8.509],
      [115.2543, -8.5031],
    ];
    const shape = encodePolyline(road, PLAN_LEG_SHAPE_PRECISION);
    const [routed, guessed] = dayLegs([STAY, RIDGE, SPA], [{ ...stored, shape }]);
    expect(routed?.path).toEqual(road);
    expect(guessed?.path).toBeNull();
    expect(dayLegs([STAY, RIDGE], [{ ...stored, shape: 'x' }])[0]?.path).toBeNull();
  });
});

describe('legPathsByPair', () => {
  it('keys every drawable shape of a version by its pair', () => {
    const shape = encodePolyline(
      [
        [1, 1],
        [2, 2],
      ],
      PLAN_LEG_SHAPE_PRECISION,
    );
    const paths = legPathsByPair([
      { from_key: 'stay', to_key: 'ridge', shape },
      { from_key: 'ridge', to_key: 'spa', shape: null },
    ]);
    expect([...paths.keys()]).toEqual(['stay>ridge']);
    expect(paths.get('stay>ridge')).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('a leg between two areas', () => {
  const stay = { key: 'stay', lat: -13.5167, lng: -71.9781 };
  const gate = { key: 'gate', lat: -13.1631, lng: -72.545 };
  const stored = (mode: string, source: string) => ({
    from_key: 'stay',
    to_key: 'gate',
    mode,
    minutes: 210,
    meters: 0,
    source,
    approx: 0,
  });

  it("keeps a stored link leg with the link's mode and minutes, always as an estimate", () => {
    const [leg] = dayLegs([stay, gate], [stored('train', 'link')]);
    expect(leg).toMatchObject({ mode: 'train', minutes: 210, source: 'link', approx: true });
  });

  it('still estimates a stored leg whose mode it does not know', () => {
    const [leg] = dayLegs([stay, gate], [stored('teleport', 'link')]);
    expect(leg).toMatchObject({ mode: 'drive', source: 'straight_line', approx: true });
  });
});
