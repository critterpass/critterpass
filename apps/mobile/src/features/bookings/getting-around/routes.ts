/** Getting around's sheets: logging a ride and why a fare estimate says what it says. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { RideQuoteResult } from '@cp/domain';
import type { Href } from 'expo-router';

import { readFareEstimate } from './fare-estimate';

export function logRideRoute(params: {
  readonly tripId: string;
  readonly legRef: string;
  readonly provider: string;
  readonly currency: string;
  readonly quoteId?: string;
  /** Comma-separated user ids who rode (the plan item's attendees). */
  readonly attendees?: string;
}): Href {
  return { pathname: '/supplier/log-ride', params };
}

export function estimateRoute(quote: RideQuoteResult): Href {
  const fare = readFareEstimate(quote);
  return {
    pathname: '/supplier/estimate',
    params: {
      basis: fare?.basis ?? '',
      sources: JSON.stringify(fare?.sources ?? []),
      checked: fare?.checked_at ?? '',
      reviewed: fare?.reviewed ? '1' : '0',
    },
  };
}
