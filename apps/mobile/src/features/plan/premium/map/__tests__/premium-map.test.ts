import { describe, expect, it } from '@jest/globals';

import { dayColours } from '../day-colours';
import { cameraPadding, settleDetent, sheetHeight } from '../detents';
import { MAP_PALETTES } from '../palette';
import { premiumMapStyle } from '../premium-map-style';
import { boatArc, dayLegs, planMapFeatures, traceLegs, type MapDay } from '../route-features';

const stay = [115.26, -8.5] as const;
const day3: MapDay = {
  dayNo: 3,
  stops: [
    { id: 'a', n: 1, lat: -8.49, lng: 115.25 },
    { id: 'b', n: 2, lat: -8.48, lng: 115.27, legKey: 'b-stable' },
  ],
  legModes: new Map([['a>b-stable', 'walk']]),
};

describe('dayColours', () => {
  it('runs sun, pink, sky, mint, tangerine and repeats', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => dayColours(n).fill)).toEqual([
      '#ffd84a',
      '#ff5fa8',
      '#4f86ff',
      '#54d6a4',
      '#ff9a4d',
      '#ffd84a',
    ]);
    expect(dayColours(1).route).toBe('#e0a800');
    expect(dayColours(0).fill).toBe('#ffd84a');
  });
});

describe('premiumMapStyle', () => {
  it('paints the same tiles in the light or night palette, reading the region it is given', () => {
    const light = premiumMapStyle('light', 'pmtiles://example/bali.pmtiles');
    const night = premiumMapStyle('night', 'pmtiles://example/bali.pmtiles');
    expect(light.sources['region']).toEqual({
      type: 'vector',
      url: 'pmtiles://example/bali.pmtiles',
    });
    const paint = (style: typeof light, id: string) =>
      style.layers.find((layer) => layer.id === id)?.paint as Record<string, unknown>;
    expect(paint(light, 'background')['background-color']).toBe(MAP_PALETTES.light.land);
    expect(paint(night, 'background')['background-color']).toBe(MAP_PALETTES.night.land);
    expect(paint(night, 'region-water')['fill-color']).toBe(MAP_PALETTES.night.lake);
    expect(light.layers.map((layer) => layer.id)).toEqual(night.layers.map((layer) => layer.id));
  });
});

describe('route features', () => {
  it('walks the day leg by leg from the stay and back, walks marked', () => {
    const legs = dayLegs(day3, stay);
    expect(legs.map((leg) => leg.mode)).toEqual(['car', 'walk', 'car']);
    expect(legs[0]?.path[0]).toEqual(stay);
    expect(legs.at(-1)?.path.at(-1)).toEqual(stay);
  });

  it('bows a boat crossing into an arc that starts and ends on the piers', () => {
    const arc = boatArc([0, 0], [1, 0]);
    expect(arc).toHaveLength(25);
    expect(arc[0]).toEqual([0, 0]);
    expect(arc.at(-1)).toEqual([1, 0]);
    expect(arc[12]?.[1]).not.toBe(0);
  });

  it('traces the route out from the stay', () => {
    const legs = dayLegs(day3, stay);
    expect(traceLegs(legs, 0)).toHaveLength(0);
    expect(traceLegs(legs, 1)).toHaveLength(3);
    const half = traceLegs(legs, 0.5);
    expect(half.length).toBeGreaterThan(0);
    expect(half.length).toBeLessThanOrEqual(3);
  });

  it('numbers the chosen day and dots the others, fading what a filter leaves out', () => {
    const other: MapDay = { dayNo: 1, stops: [{ id: 'x', n: 1, lat: -8.4, lng: 115.2 }] };
    const { legs, pins } = planMapFeatures({
      days: [day3, other],
      chosenDayNo: 3,
      stay,
      faded: new Set(['x']),
    });
    expect(legs.features.every((f) => f.properties.color === dayColours(3).route)).toBe(true);
    const byId = Object.fromEntries(pins.features.map((f) => [f.properties.id, f.properties]));
    expect(byId['a']).toMatchObject({ kind: 'pin', label: '1', faded: false });
    expect(byId['x']).toMatchObject({ kind: 'dot', color: dayColours(1).fill, faded: true });
    // The chosen day draws last, over the dots.
    expect(pins.features.at(-1)?.properties.kind).toBe('pin');
  });
});

describe('sheet detents', () => {
  it('keeps the designed heights on an 844 pt phone', () => {
    expect(sheetHeight('peek', 844)).toBe(296);
    expect(sheetHeight('half', 844)).toBe(544);
    expect(sheetHeight('full', 844)).toBe(648);
  });

  it('fits the camera between the chrome and the sheet', () => {
    expect(cameraPadding('half', 844)).toEqual({ top: 134, bottom: 568, left: 24, right: 24 });
  });

  it('settles on the nearest detent, or the next one on a fling', () => {
    expect(settleDetent(320, 0, 844)).toBe('peek');
    expect(settleDetent(500, 0, 844)).toBe('half');
    expect(settleDetent(320, 1200, 844)).toBe('half');
    expect(settleDetent(600, -1200, 844)).toBe('half');
    expect(settleDetent(560, -1200, 844)).toBe('half');
    expect(settleDetent(400, -1200, 844)).toBe('peek');
  });
});
