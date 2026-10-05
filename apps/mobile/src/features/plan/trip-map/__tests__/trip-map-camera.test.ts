/**
 * Where a planning map's camera goes: it opens on the day's stops (in the part of the view the
 * sheet leaves free), fits again when the day's stops change and not when the same plan is read
 * again, and knows when the points it was asked to show are still out of view.
 */
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import type { TripDay } from '../trip-days';
import { fitSignature, openingCamera, pointsInView, viewPoints } from '../trip-map-camera';

const UBUD: readonly [number, number] = [115.2625, -8.5069];
const CANGGU: readonly [number, number] = [115.1385, -8.6478];
const SIZE = { width: 390, height: 844 };

/** Screen position of a point for a camera, as web mercator at 512 px per world tile. */
function project(
  camera: { center: readonly [number, number]; zoom: number },
  point: readonly [number, number],
) {
  const world = 512 * 2 ** camera.zoom;
  const x = (lng: number) => ((lng + 180) / 360) * world;
  const y = (lat: number) =>
    (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * world;
  return {
    x: SIZE.width / 2 + x(point[0]) - x(camera.center[0]),
    y: SIZE.height / 2 + y(point[1]) - y(camera.center[1]),
  };
}

function stop(stableId: string, place: { lat: number; lng: number } | null): DayItem {
  return { stableId, place } as unknown as DayItem;
}
const day = (stops: DayItem[], stay: TripDay['stay'] = null) =>
  ({ dayNo: 2, stops, stay }) as unknown as TripDay;

describe('the camera a planning map opens on', () => {
  it('shows every point between the top bar and the sheet', () => {
    const covered = { top: 170, bottom: 300 };
    const camera = openingCamera([UBUD, CANGGU], SIZE, covered);
    expect(camera).not.toBeNull();
    if (camera === null) return;
    for (const point of [UBUD, CANGGU]) {
      const at = project(camera, point);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(SIZE.width);
      expect(at.y).toBeGreaterThanOrEqual(covered.top);
      expect(at.y).toBeLessThanOrEqual(SIZE.height - covered.bottom);
    }
  });

  it('opens close on a single stop, and has nothing to say with no points or no room', () => {
    const one = openingCamera([UBUD], SIZE);
    expect(one?.zoom).toBe(15);
    expect(one?.center[0]).toBeCloseTo(UBUD[0], 5);
    expect(openingCamera([], SIZE)).toBeNull();
    expect(openingCamera([UBUD], SIZE, { top: 500, bottom: 400 })).toBeNull();
  });

  it('zooms out for a day that crosses the island', () => {
    const near = openingCamera([UBUD, [115.27, -8.51]], SIZE);
    const far = openingCamera([UBUD, [115.594, -8.277]], SIZE);
    expect(far?.zoom ?? 0).toBeLessThan(near?.zoom ?? 0);
  });
});

describe('when the camera fits again', () => {
  const a = stop('a', { lat: -8.5, lng: 115.26 });
  const b = stop('b', { lat: -8.64, lng: 115.13 });

  it('keeps its signature when the same plan is read again', () => {
    expect(fitSignature(day([a, b]))).toBe(fitSignature(day([{ ...a }, { ...b }])));
  });

  it('changes when a stop is removed, reordered, moved to another place, or the day changes', () => {
    const base = fitSignature(day([a, b]));
    expect(fitSignature(day([a]))).not.toBe(base);
    expect(fitSignature(day([b, a]))).not.toBe(base);
    expect(fitSignature(day([a, stop('b', { lat: -8.7, lng: 115.2 })]))).not.toBe(base);
    expect(fitSignature({ ...day([a, b]), dayNo: 3 })).not.toBe(base);
    expect(fitSignature(null)).toBe('');
  });

  it('knows whether the points are in view', () => {
    const bounds: [number, number, number, number] = [115.1, -8.7, 115.3, -8.4];
    expect(pointsInView([UBUD, CANGGU], bounds)).toBe(true);
    expect(pointsInView([UBUD, [115.594, -8.277]], bounds)).toBe(false);
    // The middle of the ocean, where a map with no camera sits.
    expect(pointsInView([UBUD], [-0.1, -0.1, 0.1, 0.1])).toBe(false);
  });

  it('frames every stop of the day and its stay, a far one included', () => {
    const far = stop('far', { lat: -8.277, lng: 115.594 });
    const stops = [stop('a', { lat: -8.5, lng: 115.26 }), stop('b', { lat: -8.505, lng: 115.265 })];
    const of = day([...stops, stop('c', { lat: -8.51, lng: 115.27 }), far], {
      lat: -8.6,
      lng: 115.2,
    });
    const points = viewPoints({ days: [of], ideas: [], center: null }, of);
    expect(points).toHaveLength(5);
    expect(points).toContainEqual([115.594, -8.277]);
    expect(points).toContainEqual([115.2, -8.6]);
  });
});
