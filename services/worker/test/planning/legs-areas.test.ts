/**
 * A day trip's travel: its two stay legs are the link's minutes and way to travel, an estimate
 * with no road, and the router is never asked for them; the legs between that day's own stops are
 * routed as on any day. A day trip with no link stores no stay legs rather than a guess, and a day
 * where the crew sleeps is routed as always.
 */
import { STAY_LEG_KEY } from '@cp/domain';
import { createPlanningTravel, type PlanningTravel } from '@cp/suppliers';
import { describe, expect, it } from 'vitest';

import { computeVersionLegs } from '../../src/jobs/planning/legs/compute';
import type { PlannedDay } from '../../src/jobs/planning/legs/pairs';

const CUSCO = { lat: -13.5167, lng: -71.9781 };
const RUINS = { key: '0199a0f2-0000-7000-8000-000000000001', lat: -13.1631, lng: -72.545 };
const TEMPLE = { key: '0199a0f2-0000-7000-8000-000000000002', lat: -13.1596, lng: -72.5446 };

/** The router as the legs job sees it, keeping every point it is asked to route from. */
function travelAsked(): { travel: PlanningTravel; asked: { lat: number; lng: number }[] } {
  const inner = createPlanningTravel({ valhalla: null });
  const asked: { lat: number; lng: number }[] = [];
  return {
    asked,
    travel: {
      travel: (from, to, mode) => inner.travel(from, to, mode),
      matrix: (sources, destinations, mode) => {
        asked.push(...sources.map((point) => ({ lat: point.lat, lng: point.lng })));
        return inner.matrix(sources, destinations, mode);
      },
    },
  };
}

const day = (away?: PlannedDay['away']): PlannedDay => ({
  dayId: 'day-3',
  stay: CUSCO,
  stops: [RUINS, TEMPLE],
  ...(away === undefined ? {} : { away }),
});

describe('the legs of a day trip', () => {
  it('takes the stay legs from the link and routes only the stops of the day', async () => {
    const { travel, asked } = travelAsked();
    const legs = await computeVersionLegs(
      travel,
      [day({ link: { minutes: 210, mode: 'train' } })],
      1,
    );
    const stay = legs.filter((leg) => leg.fromKey === STAY_LEG_KEY || leg.toKey === STAY_LEG_KEY);
    expect(stay).toHaveLength(2);
    for (const leg of stay) {
      expect(leg).toMatchObject({
        mode: 'train',
        minutes: 210,
        source: 'link',
        approx: true,
        shape: null,
      });
    }
    const between = legs.filter((leg) => leg.fromKey === RUINS.key && leg.toKey === TEMPLE.key);
    expect(between).toHaveLength(1);
    expect(between[0]?.source).toBe('straight_line');
    expect(asked.some((point) => point.lat === CUSCO.lat)).toBe(false);
  });

  it('stores no stay legs for a day trip with no link', async () => {
    const { travel, asked } = travelAsked();
    const legs = await computeVersionLegs(travel, [day({ link: null })], 1);
    expect(legs.map((leg) => [leg.fromKey, leg.toKey])).toEqual([[RUINS.key, TEMPLE.key]]);
    expect(asked.some((point) => point.lat === CUSCO.lat)).toBe(false);
  });

  it('routes every leg of a day where the crew sleeps', async () => {
    const { travel } = travelAsked();
    const legs = await computeVersionLegs(travel, [day()], 1);
    expect(legs).toHaveLength(3);
    expect(legs.every((leg) => leg.source === 'straight_line')).toBe(true);
  });
});
