/**
 * The rides contributor: each ride the crew logged rides one leg of the trail (the leg into the
 * plan stop its `leg_ref` names, or into its quote's drop-off), so the route knows how far the crew
 * was driven and by whom (a named driver, else the ride app or taxi). A leg counts once however many
 * rides covered it. Per traveller: the rides they logged.
 */
import type { RecapLegRide, RecapTopDriver } from '@cp/domain';
import type pg from 'pg';

import { addMetric, type RecapContributor, type RecapScope } from './types';

interface RideRow {
  readonly provider: RecapLegRide['provider'];
  readonly provider_id: string | null;
  readonly provider_name: string | null;
  readonly logged_by: string;
  readonly item_poi_id: string | null;
  readonly quote_to_poi_id: string | null;
}

async function loadRides(tx: pg.PoolClient, scope: RecapScope): Promise<RideRow[]> {
  const { rows } = await tx.query<RideRow>(
    `SELECT r.provider, r.provider_id, pr.name AS provider_name, r.logged_by,
            (SELECT pi.poi_id FROM plan_items pi
              WHERE pi.version_id = $2 AND pi.stable_id::text = r.leg_ref LIMIT 1) AS item_poi_id,
            q.to_poi_id AS quote_to_poi_id
       FROM rides r
       LEFT JOIN providers pr ON pr.id = r.provider_id
       LEFT JOIN ride_quotes q ON q.id = r.quote_id
      WHERE r.trip_id = $1
      ORDER BY r.created_at, r.id`,
    [scope.trip.id, scope.trip.currentVersionId],
  );
  return rows;
}

function driverKey(ride: RecapLegRide): string {
  return `${ride.provider}:${ride.provider_id ?? ''}`;
}

function topDriver(drivers: readonly RecapTopDriver[]): RecapTopDriver | null {
  const sorted = [...drivers].sort(
    (a, b) =>
      b.distance_m - a.distance_m ||
      b.rides - a.rides ||
      (driverKey(a) < driverKey(b) ? -1 : driverKey(a) > driverKey(b) ? 1 : 0),
  );
  const top = sorted[0];
  return top === undefined || top.distance_m === 0 ? null : top;
}

export const ridesContributor: RecapContributor = {
  name: 'rides',
  async contribute(tx, scope, draft) {
    const rides = await loadRides(tx, scope);
    const { stops } = draft.route;
    const legs = draft.route.legs.map((leg) => ({ ...leg }));
    const drivers = new Map<string, RecapTopDriver>();
    for (const row of rides) {
      if (scope.members.includes(row.logged_by)) addMetric(draft, row.logged_by, 'rides_logged', 1);
      const ride: RecapLegRide = {
        provider: row.provider,
        provider_id: row.provider_id,
        provider_name: row.provider_name,
      };
      const poiId = row.item_poi_id ?? row.quote_to_poi_id;
      const leg =
        poiId === null
          ? undefined
          : legs.find(
              (candidate) => candidate.ride === null && stops[candidate.to]?.poi_id === poiId,
            );
      const key = driverKey(ride);
      const driver = drivers.get(key) ?? { ...ride, distance_m: 0, rides: 0 };
      drivers.set(key, {
        ...driver,
        rides: driver.rides + 1,
        distance_m: driver.distance_m + (leg?.distance_m ?? 0),
      });
      if (leg !== undefined) leg.ride = ride;
    }
    draft.route = {
      ...draft.route,
      legs,
      rides: rides.length,
      ridden_m: legs.reduce((sum, leg) => sum + (leg.ride === null ? 0 : leg.distance_m), 0),
      top_driver: topDriver([...drivers.values()]),
    };
  },
};
