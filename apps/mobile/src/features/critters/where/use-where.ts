/**
 * Where-to-find's rows, all synced and read on the phone: the trip's destination (in_trip first),
 * its spawn rules and their places, the legendary windows, the form and its critter, my verified
 * finds and the reader's distance unit. The last position never leaves the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { Rarity } from '@cp/domain';
import { useMemo } from 'react';

import { distanceUnitOf } from '../quests/befriend-spot';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  SPAWN_POIS_SQL,
  SPAWN_POIS_TABLES,
  SPAWNS_SQL,
  SPAWNS_TABLES,
  type SpawnPoiRow,
  type SpawnSqlRow,
} from '../data/spawn-rows';
import { useLatestPosition } from '../hatch/arrival';
import { destinationSpots, formWhere, type DestinationSpot, type FormWhere } from './where-model';

const TRIP_SQL = `SELECT t.destination_id, d.slug AS destination_slug, d.name AS destination_name
  FROM trips t
  JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.status IN ('confirmed', 'pre_trip', 'in_trip')
  ORDER BY CASE t.status WHEN 'in_trip' THEN 0 WHEN 'pre_trip' THEN 1 ELSE 2 END, t.start_date
  LIMIT 1`;
const TRIP_TABLES = ['trips', 'trip_participants', 'destinations'];
const WINDOWS_SQL = 'SELECT id, place_line, challenge FROM legendary_windows';
const FORM_SQL = `SELECT f.id, f.critter_id, f.rarity, f.requirement_copy, c.key AS critter_key,
    c.canonical_seed, c.city
  FROM critter_forms f JOIN critters c ON c.id = f.critter_id WHERE f.id = ?`;
const FOUND_SQL = `SELECT form_id FROM collection_entries
  WHERE user_id = ? AND verification <> 'revoked'`;
const UNIT_SQL = 'SELECT distance_unit FROM user_settings WHERE user_id = ?';

interface TripRow {
  readonly destination_id: string | null;
  readonly destination_slug: string | null;
  readonly destination_name: string | null;
}

interface FormRow {
  readonly id: string;
  readonly critter_id: string;
  readonly rarity: Rarity;
  readonly requirement_copy: string | null;
  readonly critter_key: string;
  readonly canonical_seed: number | null;
  readonly city: string | null;
}

export interface WhereTrip {
  readonly destinationId: string | null;
  readonly slug: string | null;
  readonly name: string | null;
}

function useTripRows(watching: boolean) {
  const uid = useOwnerUid();
  const trip = useLiveRows<TripRow>(
    TRIP_SQL,
    uid === null || !watching ? null : [uid],
    TRIP_TABLES,
  );
  const rules = useLiveRows<SpawnSqlRow>(SPAWNS_SQL, watching ? [] : null, SPAWNS_TABLES);
  const pois = useLiveRows<SpawnPoiRow>(SPAWN_POIS_SQL, watching ? [] : null, SPAWN_POIS_TABLES);
  const found = useLiveRows<{ form_id: string }>(
    FOUND_SQL,
    uid === null || !watching ? null : [uid],
    ['collection_entries'],
  );
  const unit = useLiveRows<{ distance_unit: string | null }>(
    UNIT_SQL,
    uid === null || !watching ? null : [uid],
    ['user_settings'],
  );
  const position = useLatestPosition(watching);
  const row = trip.rows[0];
  const tripInfo: WhereTrip = {
    destinationId: row?.destination_id ?? null,
    slug: row?.destination_slug ?? null,
    name: row?.destination_name ?? null,
  };
  return { trip: tripInfo, rules, pois, found, unit, position };
}

export interface WhereData {
  readonly loaded: boolean;
  readonly where: FormWhere | null;
  readonly found: boolean;
  readonly critterId: string | null;
  readonly requirement: string | null;
  readonly critter: { readonly key: string; readonly seed: number; readonly city: string } | null;
  readonly trip: WhereTrip;
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly unit: 'metric' | 'imperial';
}

export function useWhere(formId: string): WhereData {
  const rows = useTripRows(true);
  const windows = useLiveRows<{ id: string; place_line: string | null; challenge: string | null }>(
    WINDOWS_SQL,
    [],
    ['legendary_windows'],
  );
  const form = useLiveRows<FormRow>(FORM_SQL, [formId], ['critter_forms', 'critters']);
  const { trip, rules, pois, found, unit, position } = rows;
  const where = useMemo(
    () =>
      formWhere({
        formId,
        rules: rules.rows,
        pois: new Map(pois.rows.map((poi) => [poi.id, poi])),
        windows: windows.rows,
        destinationId: trip.destinationId,
        position,
      }),
    [formId, rules.rows, pois.rows, windows.rows, trip.destinationId, position],
  );
  const formRow = form.rows[0];
  return {
    loaded: rules.loaded && form.loaded,
    where,
    found: found.rows.some((row) => row.form_id === formId),
    critterId: formRow?.critter_id ?? null,
    requirement: formRow?.requirement_copy ?? null,
    critter:
      formRow === undefined
        ? null
        : { key: formRow.critter_key, seed: formRow.canonical_seed ?? 0, city: formRow.city ?? '' },
    trip,
    position,
    unit: distanceUnitOf(unit.rows[0]?.distance_unit),
  };
}

/** NEAR ME's map: the trip destination's spots, each with the rarest tier still waiting there. */
export function useNearSpots(watching: boolean): {
  readonly spots: readonly DestinationSpot[];
  readonly trip: WhereTrip;
  readonly position: { readonly lat: number; readonly lng: number } | null;
} {
  const { trip, rules, pois, found, position } = useTripRows(watching);
  const spots = useMemo(
    () =>
      destinationSpots({
        rules: rules.rows,
        pois: new Map(pois.rows.map((poi) => [poi.id, poi])),
        destinationId: trip.destinationId,
        foundFormIds: new Set(found.rows.map((row) => row.form_id)),
        position,
      }),
    [rules.rows, pois.rows, trip.destinationId, found.rows, position],
  );
  return { spots: watching ? spots : [], trip, position };
}
