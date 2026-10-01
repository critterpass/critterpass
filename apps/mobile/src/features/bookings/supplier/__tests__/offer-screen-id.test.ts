/**
 * Other areas open "where to book this" by its screen id: the registration carries the trip, the
 * activity's name and, when the caller has one, the day.
 */
// The registration module also pulls in Explore (so its screens register at startup); this test
// is about the supplier ids only, so Explore's screens are left out of it.
jest.mock('@/features/explore', () => ({}));

import { describe, expect, it, jest } from '@jest/globals';

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
