/** The trip's stay per night (`@cp/db`, shared with the worker's legs job and plan check). */
import { tripStay } from '@cp/db';

import type { StaySource } from './fit/context';

export { tripLocalDate, tripStay, type TripStay } from '@cp/db';

/** Fit's stay: a booked crew stay covering the night wins, then the version's own stay places. */
export const tripStaySource: StaySource = {
  async stayFor(tx, tripId, versionId, date) {
    const stay = await tripStay(tx, tripId, date, versionId);
    return stay === null ? null : { lat: stay.lat, lng: stay.lng };
  },
};
