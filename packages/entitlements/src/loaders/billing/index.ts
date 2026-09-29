/**
 * Every billing entitlement source, as two loader lists the server registers with its entitlement
 * materialiser: what a user holds (Pass+ sources) and what a trip holds (Boost sources).
 */
import type { EntitlementSource } from '../../sources';
import { loadCodeGrantSources } from './code-grant';
import { loadBuyerCrewYearSources, loadCrewYearSources } from './crew-year';
import { loadTripFtfSources, loadUserFtfSources } from './ftf';
import type { RunQuery } from './query';
import { loadStoreSubSources } from './store-sub';
import { loadTripBoostSources } from './trip-boost';

export type { RunQuery } from './query';

export type BillingUserLoader = (run: RunQuery, uid: string) => Promise<EntitlementSource[]>;
export type BillingTripLoader = (
  run: RunQuery,
  trip: { readonly tripId: string; readonly crewId: string },
) => Promise<EntitlementSource[]>;

export const BILLING_USER_LOADERS: readonly BillingUserLoader[] = [
  loadStoreSubSources,
  loadUserFtfSources,
  loadBuyerCrewYearSources,
  loadCodeGrantSources,
];

export const BILLING_TRIP_LOADERS: readonly BillingTripLoader[] = [
  (run, trip) => loadTripBoostSources(run, trip.tripId),
  (run, trip) => loadTripFtfSources(run, trip.tripId),
  (run, trip) => loadCrewYearSources(run, trip.crewId),
];
