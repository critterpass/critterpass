/**
 * The OpenStreetMap answer for a curated place no row of ours carries (`@cp/suppliers` asks Nominatim,
 * `@cp/planner` accepts). Nominatim is asked for the place's English name, then its local name,
 * inside a box around the researcher's point (`NEAR_DEGREES`); a day trip or nature area is asked
 * once more inside a wider box (`WIDE_DEGREES`). A result is the place only when one of its names
 * passes the curated name rules and it lies within `ACCEPT_RADIUS_M` of the point
 * (`FAR_ACCEPT_RADIUS_M` for a day trip or nature area). The name, point and address then come
 * from OpenStreetMap, never from the researcher's point.
 */
import type { NominatimQuery } from '@cp/domain';
import { findOsmPlace, type CuratedLead, type OsmLookup } from '@cp/planner';
import { boxAround, type NominatimSearch } from '@cp/suppliers';

import type { CuratedPlaceRow } from './rows';

export const NEAR_DEGREES = 0.2;
export const WIDE_DEGREES = 1;
export const ACCEPT_RADIUS_M = 2_000;
export const FAR_ACCEPT_RADIUS_M = 10_000;

/** Whether the curated line marks a place the researcher's point may be far from. */
export function farReaching(row: CuratedPlaceRow): boolean {
  if (row.category === 'nature') return true;
  const text = [row.subtype ?? '', row.name_en, row.why_go_en, row.getting_there].join(' ');
  return /\bday[- ]trips?\b/iu.test(text);
}

/** Asks Nominatim for one curated place (see the file header). */
export function findCuratedOsmPlace(
  row: CuratedPlaceRow,
  plain: ReadonlySet<string>,
  search: NominatimSearch,
): Promise<OsmLookup> {
  const lead: CuratedLead = {
    name: row.name_en,
    localName: row.name_local ?? null,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
  };
  const far = farReaching(row);
  // A bracket in the English name is an area or a note ("Sedlec Ossuary (Kutná Hora)").
  const bare = row.name_en.replace(/\s*\([^)]*\)\s*/gu, ' ').trim();
  const local = row.name_local?.trim() ?? '';
  const names = [...new Set([bare === '' ? row.name_en : bare, local])].filter((n) => n !== '');
  const queries: NominatimQuery[] = (far ? [NEAR_DEGREES, WIDE_DEGREES] : [NEAR_DEGREES]).flatMap(
    (degrees) => names.map((q) => ({ q, box: boxAround(row.lat, row.lng, degrees) })),
  );
  return findOsmPlace(lead, queries, plain, far ? FAR_ACCEPT_RADIUS_M : ACCEPT_RADIUS_M, search);
}
