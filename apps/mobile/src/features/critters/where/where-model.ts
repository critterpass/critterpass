/**
 * Where, when and how a form can be met, from the synced spawn rules (the trip pack the encounter
 * engine reads): its spots nearest first, and the steps that take it (be there, stay a few
 * minutes, by sunrise or after dark, on its day, with the crew, after enough of the set). Never a
 * name the traveller hasn't found: unfound forms read as their tier, as the hint line does.
 */
/* eslint-disable lingui/no-unlocalized-strings -- step and rule kinds, never copy. */
import {
  DEFAULT_ENCOUNTER_CONFIG,
  distanceM,
  placesNeeded,
  type LatLng,
  type Rarity,
  type SolarCondition,
} from '@cp/domain';

import { spotsFor, type SpawnPoiRow, type SpawnSqlRow } from '../data/spawn-rows';

export interface WhereSpot {
  /** Stable per place across rules (the POI id, or the rule's geofence). */
  readonly key: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly radiusM: number;
  /** Metres from the phone, or null without a position. */
  readonly distanceM: number | null;
}

export type WhereStep =
  | { readonly kind: 'go'; readonly places: number }
  | { readonly kind: 'places'; readonly n: number }
  | { readonly kind: 'stay'; readonly minutes: number }
  | { readonly kind: 'solar'; readonly when: SolarCondition }
  | { readonly kind: 'day'; readonly placeLine: string | null; readonly challenge: string | null }
  | { readonly kind: 'together'; readonly members: number }
  | { readonly kind: 'set_first'; readonly n: number };

export interface FormWhere {
  readonly formId: string;
  readonly critterId: string;
  readonly rarity: Rarity;
  readonly spots: readonly WhereSpot[];
  readonly steps: readonly WhereStep[];
  readonly nearest: WhereSpot | null;
}

/** The legendary window a spawn names, as `legendary_windows` syncs it. */
export interface WhereWindow {
  readonly id: string;
  readonly place_line: string | null;
  readonly challenge: string | null;
}

function bySpotDistance(a: WhereSpot, b: WhereSpot): number {
  if (a.distanceM === null || b.distanceM === null) return a.name.localeCompare(b.name);
  return a.distanceM - b.distanceM;
}

function spotsOf(
  rules: readonly SpawnSqlRow[],
  pois: ReadonlyMap<string, SpawnPoiRow>,
  position: LatLng | null,
): WhereSpot[] {
  const seen = new Map<string, WhereSpot>();
  for (const rule of rules) {
    for (const spot of spotsFor(rule, pois)) {
      if (seen.has(spot.placeKey)) continue;
      seen.set(spot.placeKey, {
        key: spot.placeKey,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        radiusM: spot.radiusM ?? DEFAULT_ENCOUNTER_CONFIG.radius_m,
        distanceM: position === null ? null : distanceM(position, spot),
      });
    }
  }
  return [...seen.values()].sort(bySpotDistance);
}

function stepsOf(rule: SpawnSqlRow, places: number, windows: readonly WhereWindow[]): WhereStep[] {
  const steps: WhereStep[] = [];
  if (rule.kind === 'set_count') steps.push({ kind: 'set_first', n: Math.max(1, rule.n ?? 1) });
  const needed = placesNeeded(rule);
  steps.push(needed > 1 ? { kind: 'places', n: needed } : { kind: 'go', places });
  if (rule.window_id !== null) {
    const window = windows.find((w) => w.id === rule.window_id);
    steps.push({
      kind: 'day',
      placeLine: window?.place_line ?? null,
      challenge: window?.challenge ?? null,
    });
  }
  if (rule.solar !== null) steps.push({ kind: 'solar', when: rule.solar });
  if (rule.kind === 'co_presence') {
    steps.push({ kind: 'together', members: Math.max(2, rule.min_members ?? 2) });
  }
  if (rule.dwell_s > 0)
    steps.push({ kind: 'stay', minutes: Math.max(1, Math.round(rule.dwell_s / 60)) });
  return steps;
}

/**
 * Where one form can be met on this trip: the destination's rules for it (any destination when the
 * trip has none), its spots nearest first, and the steps of its easiest rule (the one with the
 * fewest conditions). Null when no rule anywhere gives it.
 */
export function formWhere(input: {
  readonly formId: string;
  readonly rules: readonly SpawnSqlRow[];
  readonly pois: ReadonlyMap<string, SpawnPoiRow>;
  readonly windows: readonly WhereWindow[];
  readonly destinationId: string | null;
  readonly position: LatLng | null;
}): FormWhere | null {
  const all = input.rules.filter((r) => r.form_id === input.formId);
  const here =
    input.destinationId === null ? [] : all.filter((r) => r.destination_id === input.destinationId);
  const rules = here.length > 0 ? here : all;
  const first = rules[0];
  if (first === undefined) return null;
  const spots = spotsOf(rules, input.pois, input.position);
  const ranked = rules
    .map((rule) => stepsOf(rule, spotsOf([rule], input.pois, null).length, input.windows))
    .sort((a, b) => a.length - b.length);
  return {
    formId: input.formId,
    critterId: first.critter_id,
    rarity: first.rarity as Rarity,
    spots,
    steps: ranked[0] ?? [],
    nearest: spots[0] ?? null,
  };
}

export interface DestinationSpot extends WhereSpot {
  /** The rarest tier still to find here, or null when everything here is found. */
  readonly unfound: Rarity | null;
  /** Forms that can be met here, found or not. */
  readonly forms: number;
}

const TIER_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Every spot of a destination for NEAR ME's map, with the rarest tier still waiting at each. */
export function destinationSpots(input: {
  readonly rules: readonly SpawnSqlRow[];
  readonly pois: ReadonlyMap<string, SpawnPoiRow>;
  readonly destinationId: string | null;
  readonly foundFormIds: ReadonlySet<string>;
  readonly position: LatLng | null;
}): DestinationSpot[] {
  if (input.destinationId === null) return [];
  const spots = new Map<string, { spot: WhereSpot; forms: Set<string>; unfound: Rarity | null }>();
  for (const rule of input.rules) {
    if (rule.destination_id !== input.destinationId) continue;
    for (const spot of spotsOf([rule], input.pois, input.position)) {
      const entry = spots.get(spot.key) ?? { spot, forms: new Set<string>(), unfound: null };
      entry.forms.add(rule.form_id);
      const tier = rule.rarity as Rarity;
      if (
        !input.foundFormIds.has(rule.form_id) &&
        (entry.unfound === null || TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(entry.unfound))
      ) {
        entry.unfound = tier;
      }
      spots.set(spot.key, entry);
    }
  }
  return [...spots.values()]
    .map(({ spot, forms, unfound }) => ({ ...spot, forms: forms.size, unfound }))
    .sort(bySpotDistance);
}

/**
 * Where the map opens: the middle of the spots (and the phone, when it is near enough to matter),
 * zoomed so they all fit on a phone-wide map; a lone spot opens at street level.
 */
export function mapFraming(
  spots: readonly Pick<WhereSpot, 'lat' | 'lng'>[],
  position: LatLng | null,
): { readonly center: LatLng; readonly zoom: number } | null {
  const near = position !== null && spots.some((s) => distanceM(position, s) <= 10_000);
  const points: LatLng[] = [...spots, ...(near && position !== null ? [position] : [])];
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  const span = Math.max(...points.map((p) => distanceM(center, p)));
  // About 800 m from the middle to the edge fits at 14; every doubling of the span is one level out.
  const zoom = span < 400 ? 15 : 14 - Math.log2(span / 800);
  return { center, zoom: Math.min(15, Math.max(9, Math.round(zoom * 10) / 10)) };
}
