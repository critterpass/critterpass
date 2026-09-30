/**
 * The ride quote's tariff estimate: the destination's published ride tariffs (the `ride_tariffs`
 * content release) priced over the real route in traffic (Mapbox `driving-traffic` through the
 * routing port), each range also in the crew's settlement currency at the latest stored rates.
 *
 * The live release counts as reviewed; while none is live, the newest batch still in review is
 * served flagged `reviewed: false`. No tariffs for the destination, no routed path (a straight-line
 * fallback is not a route) or no routing provider → no estimate, never a guessed one.
 */
import { withSystem } from '@cp/db';
import {
  estimateRideFare,
  RIDE_FARE_COPY_KEY,
  rideTariffSchema,
  tariffCheckedOn,
  type RideFareEstimate,
  type RideFareEstimateOption,
  type RideTariff,
  type RouteEtaProvider,
} from '@cp/domain';
import { loadRelease } from '@cp/content';
import type pg from 'pg';

import { createMapboxRoutingProvider } from '../routing/eta';
import { MapboxRoutingClient } from '../routing/mapbox';
import { convertWithSnapshots } from '../travel-data/fx';
import type { SupplierEnv } from './link-config';
import { toMinor } from './order-store';

/** Mapbox routing for the estimate, from the api's own token; unset = no tariff estimate. */
export function rideRoutingFromEnv(
  env: SupplierEnv,
  onError?: (error: unknown) => void,
): RouteEtaProvider | undefined {
  const token = env['MAPBOX_TOKEN'];
  if (!token) return undefined;
  return createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: token }),
    ...(onError ? { onProviderError: onError } : {}),
  });
}

export interface RideTariffSet {
  readonly tariffs: readonly RideTariff[];
  readonly reviewed: boolean;
}

/** The destination's tariffs from the live release, else from the newest batch still in review. */
export async function loadRideTariffs(
  tx: pg.PoolClient,
  destination: string,
): Promise<RideTariffSet | null> {
  const { rows } = await tx.query<{ artifact: unknown; status: string }>(
    `SELECT artifact, status FROM content_releases
      WHERE kind = 'ride_tariffs' AND status IN ('published', 'approved', 'review', 'blocked')
      ORDER BY (status = 'published') DESC, version DESC LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) return null;
  const release = loadRelease(row.artifact, 'ride_tariffs');
  const tariffs = release.items
    .map((item) => rideTariffSchema.parse(item))
    .filter((t) => t.destination === destination);
  return tariffs.length === 0 ? null : { tariffs, reviewed: row.status === 'published' };
}

async function inCrewCurrency(
  tx: pg.PoolClient,
  option: { low_minor: number; high_minor: number; currency: string },
  crewCurrency: string | null,
  now: Date,
): Promise<RideFareEstimateOption['crew']> {
  if (crewCurrency === null || crewCurrency === option.currency) return null;
  const low = await convertWithSnapshots(tx, option.low_minor, option.currency, crewCurrency, now);
  const high = await convertWithSnapshots(
    tx,
    option.high_minor,
    option.currency,
    crewCurrency,
    now,
  );
  if (low === null || high === null) return null;
  return {
    low_minor: low.to.amount_minor,
    high_minor: high.to.amount_minor,
    currency: crewCurrency,
    fx_as_of: low.as_of,
    fx_stale: low.stale,
  };
}

export interface FareEstimateInput {
  readonly destination: string | null;
  readonly crewCurrency: string | null;
  readonly from: { readonly lat: number; readonly lng: number };
  readonly to: { readonly lat: number; readonly lng: number };
  readonly now: Date;
}

export async function fareEstimate(
  deps: { readonly pool: pg.Pool; readonly routing: RouteEtaProvider | undefined },
  input: FareEstimateInput,
): Promise<RideFareEstimate | null> {
  const { destination } = input;
  const { routing } = deps;
  if (destination === null || routing === undefined) return null;
  const set = await withSystem(deps.pool, (tx) => loadRideTariffs(tx, destination));
  if (set === null) return null;
  const route = await routing.eta({
    originLat: input.from.lat,
    originLng: input.from.lng,
    destLat: input.to.lat,
    destLng: input.to.lng,
    mode: 'auto',
  });
  if (route.estimate) return null;
  const options = await withSystem(deps.pool, async (tx) => {
    const priced: RideFareEstimateOption[] = [];
    for (const tariff of set.tariffs) {
      const range = estimateRideFare(tariff, {
        distanceM: route.distanceM,
        minutes: route.minutes,
      });
      const local = {
        low_minor: Number(toMinor(range.low, range.currency)),
        high_minor: Number(toMinor(range.high, range.currency)),
        currency: range.currency,
      };
      priced.push({
        ride_class: tariff.ride_class,
        operator: tariff.operator,
        ...local,
        basis: range.basis,
        peak_factor: range.peakFactor,
        minimum_applied: range.minimumApplied,
        extras: tariff.extras.map((extra) => ({
          kind: extra.kind,
          amount_minor: Number(toMinor(extra.amount, tariff.currency)),
        })),
        crew: await inCrewCurrency(tx, local, input.crewCurrency, input.now),
        sources: tariff.sources,
        checked_at: tariffCheckedOn(tariff),
        reviewed: set.reviewed,
      });
    }
    return priced;
  });
  return {
    copy_key: RIDE_FARE_COPY_KEY,
    distance_m: route.distanceM,
    duration_min: route.minutes,
    traffic: route.traffic,
    options,
  };
}
