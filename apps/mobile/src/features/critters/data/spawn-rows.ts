/**
 * Spawn rules from the trip pack with the places they name: each rule's spots (its POIs'
 * coordinates, or its own geofences) resolved on the device, so NEAR ME and the encounter engine
 * work offline and no position ever leaves the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import {
  distanceM,
  spawnGeofenceSchema,
  type LatLng,
  type SpawnKind,
  type SpawnRuleRow,
  type SolarCondition,
} from '@cp/domain';

import { parseJson } from './queries';

export const SPAWNS_SQL = `SELECT s.id, s.key, s.form_id, s.kind, s.set_id, s.destination_id,
    s.poi_ids, s.geofences, s.n, s.dwell_s, s.hold_ms, s.window_id, s.solar, s.min_members,
    s.foreground_only, s.copy, f.critter_id, f.rarity
  FROM spawn_rules s JOIN critter_forms f ON f.id = s.form_id`;
export const SPAWNS_TABLES = ['spawn_rules', 'critter_forms'];

export interface SpawnSqlRow {
  readonly id: string;
  readonly key: string;
  readonly form_id: string;
  readonly kind: SpawnKind;
  readonly set_id: string;
  readonly destination_id: string | null;
  readonly poi_ids: string | null;
  readonly geofences: string | null;
  readonly n: number | null;
  readonly dwell_s: number;
  readonly hold_ms: number | null;
  readonly window_id: string | null;
  readonly solar: SolarCondition | null;
  readonly min_members: number | null;
  readonly foreground_only: number | null;
  readonly copy: string | null;
  readonly critter_id: string;
  readonly rarity: string;
}

export const SPAWN_POIS_SQL = `SELECT id, name, lat, lng, visit_radius_m FROM pois
  WHERE id IN (SELECT value FROM spawn_rules, json_each(spawn_rules.poi_ids))`;
export const SPAWN_POIS_TABLES = ['pois', 'spawn_rules'];

export interface SpawnPoiRow {
  readonly id: string;
  readonly name: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly visit_radius_m: number | null;
}

/** A synced row as the domain's rule shape (the gates read its kind, n and solar condition). */
export function ruleRow(rule: SpawnSqlRow): SpawnRuleRow {
  return {
    id: rule.id,
    key: rule.key,
    form_id: rule.form_id,
    kind: rule.kind,
    set_id: rule.set_id,
    destination_id: rule.destination_id,
    poi_ids: parseJson<string[]>(rule.poi_ids, []),
    geofences: [],
    n: rule.n,
    dwell_s: rule.dwell_s,
    hold_ms: rule.hold_ms,
    window_id: rule.window_id,
    solar: rule.solar,
    min_members: rule.min_members,
    foreground_only: rule.foreground_only === 1,
    copy: rule.copy ?? '',
  };
}

/** One place a rule can be met: one of its POIs or one of its own geofences. */
export interface SpawnSpot {
  /** POI id, or null for a geofence-only rule. */
  readonly poiId: string | null;
  /** Stable per place, for the daily rotation. */
  readonly placeKey: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Null: the engine's default radius. */
  readonly radiusM: number | null;
}

export function spotsFor(rule: SpawnSqlRow, pois: ReadonlyMap<string, SpawnPoiRow>): SpawnSpot[] {
  const spots: SpawnSpot[] = [];
  const geofences = parseJson<unknown[]>(rule.geofences, [])
    .map((g) => spawnGeofenceSchema.safeParse(g))
    .filter((r) => r.success)
    .map((r) => r.data);
  for (const poiId of parseJson<string[]>(rule.poi_ids, [])) {
    const poi = pois.get(poiId);
    if (poi === undefined || poi.lat === null || poi.lng === null) continue;
    spots.push({
      poiId,
      placeKey: poiId,
      name: poi.name ?? '',
      lat: poi.lat,
      lng: poi.lng,
      radiusM: null,
    });
  }
  geofences.forEach((g, i) =>
    spots.push({
      poiId: null,
      placeKey: `${rule.id}:${i}`,
      name: g.label ?? '',
      lat: g.lat,
      lng: g.lng,
      radiusM: g.radius_m,
    }),
  );
  return spots;
}

/**
 * NEAR ME: critters with a spot within `reachM` of the last known position, or, with no position,
 * every critter the current trip's destination can spawn.
 */
export function nearCritters(input: {
  readonly rules: readonly SpawnSqlRow[];
  readonly pois: ReadonlyMap<string, SpawnPoiRow>;
  readonly position: LatLng | null;
  readonly destinationId: string | null;
  readonly reachM: number;
}): Set<string> {
  const near = new Set<string>();
  for (const rule of input.rules) {
    if (input.position === null) {
      if (input.destinationId !== null && rule.destination_id === input.destinationId) {
        near.add(rule.critter_id);
      }
      continue;
    }
    const position = input.position;
    if (spotsFor(rule, input.pois).some((spot) => distanceM(position, spot) <= input.reachM)) {
      near.add(rule.critter_id);
    }
  }
  return near;
}
