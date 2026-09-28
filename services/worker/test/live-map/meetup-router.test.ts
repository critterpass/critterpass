/**
 * The meet-up ETA matrix at the Valhalla boundary: a recorded `sources_to_targets` answer maps to
 * minutes and metres, an unroutable cell and a failing call fall back to straight-line estimates.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { straightLineRouter, valhallaRouter } from '../../src/jobs/live-map/meetup-router';

const recorded = readFileSync(
  path.join(import.meta.dirname, 'valhalla-sources-to-targets.json'),
  'utf8',
);
const target = { lat: -8.5031, lng: 115.2544 };
const sources = [
  { lat: -8.5069, lng: 115.2625 },
  { lat: -8.6, lng: 115.3 },
];

describe('valhallaRouter', () => {
  it('asks for one column and maps routed cells, falling back per unroutable cell', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const router = valhallaRouter({
      baseUrl: 'http://valhalla.internal:8002/',
      fetch: (url, init) => {
        calls.push({ url: url as string, body: JSON.parse(init?.body as string) });
        return Promise.resolve(new Response(recorded, { status: 200 }));
      },
    });
    const cells = await router.matrix('motor_scooter', sources, target);
    expect(calls[0]?.url).toBe('http://valhalla.internal:8002/sources_to_targets');
    expect(calls[0]?.body).toMatchObject({
      costing: 'motor_scooter',
      targets: [{ lat: -8.5031, lon: 115.2544 }],
    });
    expect(cells[0]).toEqual({ minutes: 7, distanceM: 2043, estimate: false });
    expect(cells[1]?.estimate).toBe(true);
  });

  it('estimates every cell when Valhalla fails', async () => {
    const errors: unknown[] = [];
    const router = valhallaRouter({
      baseUrl: 'http://valhalla.internal:8002',
      fetch: () => Promise.resolve(new Response('busy', { status: 503 })),
      onError: (error) => errors.push(error),
    });
    const cells = await router.matrix('pedestrian', sources, target);
    expect(cells.every((cell) => cell.estimate)).toBe(true);
    expect(errors).toHaveLength(1);
  });
});

describe('straightLineRouter', () => {
  it('labels every answer an estimate', async () => {
    const [cell] = await straightLineRouter.matrix('pedestrian', [sources[0]!], target);
    expect(cell?.estimate).toBe(true);
    expect(cell?.minutes).toBeGreaterThan(3);
  });
});
