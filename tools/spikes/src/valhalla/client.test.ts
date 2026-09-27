import { describe, expect, it } from 'vitest';

import { parseMatrixResponse, parseRouteResponse } from './client';

describe('parseRouteResponse', () => {
  it('extracts duration and length from a valid /route response', () => {
    const fixture = {
      trip: { summary: { time: 187.4, length: 1.203, has_toll: false } },
      other_field_valhalla_might_add: true,
    };
    expect(parseRouteResponse(fixture)).toEqual({ durationSeconds: 187.4, lengthKm: 1.203 });
  });

  it('throws on a response missing trip.summary', () => {
    expect(() => parseRouteResponse({ trip: {} })).toThrow();
  });

  it('throws on a non-object response', () => {
    expect(() => parseRouteResponse('not json')).toThrow();
  });
});

describe('parseMatrixResponse', () => {
  it('extracts the sources_to_targets grid, allowing null cells for unreachable pairs', () => {
    const fixture = {
      sources_to_targets: [
        [
          { time: 0, distance: 0 },
          { time: 120.5, distance: 0.8 },
        ],
        [
          { time: null, distance: null },
          { time: 90, distance: 0.5 },
        ],
      ],
    };
    const grid = parseMatrixResponse(fixture);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(2);
    expect(grid[1]?.[0]).toEqual({ time: null, distance: null });
  });

  it('throws when sources_to_targets is missing', () => {
    expect(() => parseMatrixResponse({})).toThrow();
  });
});
