/**
 * Other areas open "where to book this" by its screen id: the registration carries the trip, the
 * activity's name and, when the caller has one, the day.
 */
import { describe, expect, it } from '@jest/globals';

import { hrefFor } from '@/lib/navigation/screen-registry';

import '../register';

describe('the offers screen in the navigation registry', () => {
  it('opens for a trip and an activity, on a day when one is given', () => {
    expect(
      hrefFor('6f-1', { tripId: 'trip-1', name: 'Fushimi Inari', date: '2027-04-03' }),
    ).toEqual({
      pathname: '/supplier/offer',
      params: { tripId: 'trip-1', name: 'Fushimi Inari', date: '2027-04-03' },
    });
    expect(hrefFor('6f-1', { tripId: 'trip-1', name: 'Fushimi Inari' })).toEqual({
      pathname: '/supplier/offer',
      params: { tripId: 'trip-1', name: 'Fushimi Inari' },
    });
  });

  it('keeps Getting around where it was', () => {
    expect(hrefFor('3h-3', { tripId: 'trip-1', to: 'poi-1' })).toEqual({
      pathname: '/getting-around',
      params: { tripId: 'trip-1', to: 'poi-1' },
    });
  });
});
