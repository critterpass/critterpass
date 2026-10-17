/**
 * A curated line may name its OpenStreetMap element (`osm`: "node/<id>", "way/<id>" or
 * "relation/<id>"), which a researcher confirmed on the map. The element is then the place: no
 * name rule or match distance is asked of it, only that it still exists and lies within
 * `PINNED_RADIUS_M` of the line's point (a guard against a mistyped id). The loader and the
 * lookup take our row of that element first (`./match.ts` decides who keeps it); the lookup
 * fetches an element no row carries by its id (Nominatim's lookup), and writes it the way an OSM
 * place found by name is written. An element that is gone or too far leaves the line to the name
 * rules and the search, as a line without an id.
 */
import { classifyOsmTags, type NominatimResult, type OsmTags } from '@cp/domain';
import { addressFromParts, metresBetween, type CuratedLead, type OsmPlace } from '@cp/planner';
import type { NominatimLookup } from '@cp/suppliers';

import type { CuratedPlaceRow } from './rows';

/** How far a pinned element may lie from the line's point and still be the place. */
export const PINNED_RADIUS_M = 25_000;

const PREFIX: Readonly<Record<string, string>> = { node: 'n', way: 'w', relation: 'r' };

/** The `source_ids.osm` key the ingest writes for an element ("way/42" is `w42`), or null. */
export function osmSourceId(osm: string): string | null {
  const element = /^(node|way|relation)\/([1-9]\d*)$/u.exec(osm);
  if (element === null) return null;
  return `${PREFIX[element[1] ?? ''] ?? ''}${element[2] ?? ''}`;
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/**
 * The place a looked-up element is, as a `pois` row takes it, or null when it lies beyond
 * `PINNED_RADIUS_M` of the line's point or has no point. An element without a name of its own
 * takes the line's names.
 */
export function pinnedPlace(
  row: CuratedPlaceRow,
  result: NominatimResult,
  lead: CuratedLead,
): OsmPlace | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  const prefix = PREFIX[result.osm_type];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || prefix === undefined) return null;
  const away = metresBetween(lead, { lat, lng });
  if (away > PINNED_RADIUS_M) return null;
  const details = result.namedetails ?? {};
  const own = clean(details['name']) ?? clean(result.name);
  const english = clean(details['name:en']);
  const name = english ?? own ?? row.name_en;
  const nameLocal = own === null ? (row.name_local ?? null) : own !== name ? own : null;
  const extra = result.extratags ?? {};
  const tags: OsmTags = { ...extra, name, [result.category]: result.type };
  return {
    sourceId: `${prefix}${String(result.osm_id)}`,
    name,
    nameLocal,
    category: classifyOsmTags(tags)?.category ?? row.category,
    lat,
    lng,
    address: addressFromParts(result.address),
    openingHours: clean(extra['opening_hours']),
    website: clean(extra['website'] ?? extra['contact:website']),
    phone: clean(extra['phone'] ?? extra['contact:phone']),
    distanceM: away,
  };
}

/** The line's pinned element fetched by id (see the file header), or null to fall back. */
export async function lookUpPinned(
  row: CuratedPlaceRow,
  lead: CuratedLead,
  lookup: NominatimLookup,
): Promise<OsmPlace | null> {
  if (row.osm === undefined) return null;
  const result = await lookup(row.osm);
  return result === null ? null : pinnedPlace(row, result, lead);
}
