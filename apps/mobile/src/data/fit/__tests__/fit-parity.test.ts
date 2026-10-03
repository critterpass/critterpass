/**
 * The phone fits a place exactly as the server does: the planner's shared Bali fixtures, fitted
 * directly (the server) and again from the fit route's context after a trip over the wire (JSON,
 * the legs listed, item times as text) on the phone, give the same fit for every day and for a
 * picked start, with the facts the renders show (Tirta Empul good on Saturday at 08:00).
 */
import { describe, expect, it } from '@jest/globals';

import { fitPlace, legKey, type FitContext, type FitPlace } from '@cp/planner';

import {
  BALI,
  COFFEE,
  POINTS,
  TIRTA,
  at,
  daily,
  fixtureTravel,
} from '../../../../../../packages/planner/test/fit/bali-fixture';
import { fitContextFromWire, type WireFitContext } from '../local-fit';

const COFFEE_PLACE: FitPlace = {
  poiId: COFFEE,
  point: POINTS.coffee,
  category: 'food',
  hours: daily('07:00', '17:00'),
  timeNeededMin: 45,
  outdoor: false,
};
const PLACES = [TIRTA, COFFEE_PLACE];

/** The fit route's `context` for the fixture: every leg the server would know, then JSON. */
function overTheWire(context: FitContext): WireFitContext {
  const stops = [
    { key: 'stay', lat: 0, lng: 0 },
    ...context.days.flatMap((day) =>
      day.items.map((item) => ({ key: item.stableId, lat: 0, lng: 0 })),
    ),
    ...PLACES.map((place) => ({ key: place.poiId ?? '', ...place.point })),
  ];
  const legs = stops.flatMap((from) =>
    stops
      .filter((to) => to.key !== from.key)
      .map((to) => {
        const leg = fixtureTravel(from, to);
        return { from: from.key, to: to.key, ...leg };
      }),
  );
  const { travel: _travel, ...rest } = context;
  return JSON.parse(JSON.stringify({ ...rest, legs })) as WireFitContext;
}

describe('fit parity between the server and the phone', () => {
  const phone = fitContextFromWire(overTheWire(BALI));

  it('gives the same fit for every day of every fixture place', () => {
    for (const place of PLACES) {
      expect(fitPlace(phone, place)).toEqual(fitPlace(BALI, place));
    }
  });

  it('gives the same fit for a picked start', () => {
    const picked = { at: at(17, '08:00') };
    expect(fitPlace(phone, TIRTA, picked)).toEqual(fitPlace(BALI, TIRTA, picked));
    const late = { at: at(14, '16:00') };
    expect(fitPlace(phone, TIRTA, late)).toEqual(fitPlace(BALI, TIRTA, late));
  });

  it('reads the render facts on the phone', () => {
    const fit = fitPlace(phone, TIRTA);
    const saturday = fit.days.find((day) => day.day_no === 5);
    expect(saturday?.grade).toBe('good');
    expect(saturday?.slot?.starts_at).toBe(at(17, '08:00').toISOString());
    expect(fit.days.find((day) => day.day_no === 2)?.grade).toBe('no');
    expect(legKey('stay', TIRTA.poiId ?? '')).toBe(`stay>${TIRTA.poiId ?? ''}`);
  });
});
