/**
 * The nearest place to do a "befriend" quest on this trip, from synced rows (the trip's
 * destination, its spawn rules and their places) and the phone's last position, which never
 * leaves the phone. Null until the trip pack has synced, or when the trip spawns nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import {
  SPAWN_POIS_SQL,
  SPAWN_POIS_TABLES,
  SPAWNS_SQL,
  SPAWNS_TABLES,
  type SpawnPoiRow,
  type SpawnSqlRow,
} from '../data/spawn-rows';
import { useLatestPosition } from '../hatch/arrival';
import { distanceUnitOf, nearestBefriendSpot, type BefriendSpot } from './befriend-spot';
import { useLiveRows, useOwnerUid } from './live-rows';

const TRIP_SQL = 'SELECT destination_id FROM trips WHERE id = ?';
const SETS_SQL = 'SELECT id, code FROM critter_sets';
const UNIT_SQL = 'SELECT distance_unit FROM user_settings WHERE user_id = ?';

export interface BefriendPlace {
  readonly spot: BefriendSpot | null;
  readonly unit: 'metric' | 'imperial';
}

/** `setCode`: the quest's set, when it names one. */
export function useBefriendSpot(
  tripId: string | null,
  setCode: string | null,
  watching: boolean,
): BefriendPlace {
  const uid = useOwnerUid();
  const trip = useLiveRows<{ destination_id: string | null }>(
    TRIP_SQL,
    tripId === null || !watching ? null : [tripId],
    ['trips'],
  );
  const rules = useLiveRows<SpawnSqlRow>(SPAWNS_SQL, watching ? [] : null, SPAWNS_TABLES);
  const pois = useLiveRows<SpawnPoiRow>(SPAWN_POIS_SQL, watching ? [] : null, SPAWN_POIS_TABLES);
  const sets = useLiveRows<{ id: string; code: string }>(SETS_SQL, watching ? [] : null, [
    'critter_sets',
  ]);
  const unit = useLiveRows<{ distance_unit: string | null }>(
    UNIT_SQL,
    uid === null || !watching ? null : [uid],
    ['user_settings'],
  );
  const position = useLatestPosition(watching);
  const destinationId = trip.rows[0]?.destination_id ?? null;
  const setId =
    setCode === null ? null : (sets.rows.find((set) => set.code === setCode)?.id ?? setCode);
  const spot = useMemo(
    () =>
      nearestBefriendSpot({
        rules: rules.rows,
        pois: new Map(pois.rows.map((poi) => [poi.id, poi])),
        destinationId,
        setId,
        position,
      }),
    [rules.rows, pois.rows, destinationId, setId, position],
  );
  return {
    spot: watching ? spot : null,
    unit: distanceUnitOf(unit.rows[0]?.distance_unit),
  };
}
