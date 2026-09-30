/** Getting around's sheets: logging a ride and why a fare estimate says what it says. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { RideFareEstimateOption } from '@cp/domain';
import type { Href } from 'expo-router';

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

/** The sheet gets the option itself: it is small, and never stored. */
export function estimateRoute(option: RideFareEstimateOption): Href {
  return { pathname: '/supplier/estimate', params: { option: JSON.stringify(option) } };
}

export function parseEstimateOption(raw: string | undefined): RideFareEstimateOption | null {
  try {
    const value = JSON.parse(raw ?? 'null') as RideFareEstimateOption | null;
    return value !== null && typeof value.low_minor === 'number' && Array.isArray(value.sources)
      ? value
      : null;
  } catch {
    return null;
  }
}
