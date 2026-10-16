/**
 * The OpenStreetMap answer for a curated place no row of ours carries (`@cp/suppliers` asks Nominatim,
 * `@cp/planner` accepts). Nominatim is asked, inside a box around the researcher's point
 * (`NEAR_DEGREES`), for the place's local name first (what the map itself is written in), then its
 * English name, then the English name with the city; a compound name ("Bronte Beach and Baths") is
 * asked once more by its first part. A day trip or nature area is asked again inside a wider box
 * (`WIDE_DEGREES`). A result is the place only when one of its names passes the curated name rules
 * and it lies within `ACCEPT_RADIUS_M` of the point (`SPREAD_ACCEPT_RADIUS_M` for a beach, whose
 * map point is often a stretch of coast away; `FAR_ACCEPT_RADIUS_M` for a day trip or nature
 * area). The name, point and address then come from OpenStreetMap, never from the researcher's
 * point.
 *
 * An activity (a cruise, a hike from one place to another, a class, a night show) is no point on a
 * map: `curatedStopOnly` tells the loader to keep it as a curated-only stop instead of asking.
 */
import type { NominatimQuery } from '@cp/domain';
import { findOsmPlace, type CuratedLead, type OsmLookup } from '@cp/planner';
import { boxAround, type NominatimSearch } from '@cp/suppliers';

import type { CuratedPlaceRow } from './rows';

export const NEAR_DEGREES = 0.2;
export const WIDE_DEGREES = 1;
export const ACCEPT_RADIUS_M = 2_000;
export const SPREAD_ACCEPT_RADIUS_M = 5_000;
export const FAR_ACCEPT_RADIUS_M = 10_000;

/** Whether the curated line marks a place the researcher's point may be far from. */
export function farReaching(row: CuratedPlaceRow): boolean {
  if (row.category === 'nature') return true;
  const text = [row.subtype ?? '', row.name_en, row.why_go_en, row.getting_there].join(' ');
  return /\bday[- ]trips?\b/iu.test(text);
}

const ACTIVITY =
  /\b(cruises?|catamaran|boat (?:rides?|trips?|tours?)|hikes?|treks?|trekking|(?:walking|food|bike|cycling|boat) tours?|cooking class(?:es)?|classes|workshops?|safaris?|kayaking|snorkell?ing trips?)\b/iu;
/** A show only by its own name: a cabaret's kind says "show" while the cabaret is a venue. */
const SHOW = /\b(shows?|performances?)\b/iu;
const VENUE =
  /\b(theat(?:re|er)s?|tablao|club|bar|hall|arena|stadium|cinema|museum|restaurant|cafe|café|centre|center|pier|jetty|harbour|harbor|port|temple|park)\b/iu;
/** "Fira to Oia Hike": a route between two places, not a place. */
const ROUTE = /\S \bto\b \S.*\b(hikes?|walks?|treks?|trails?|rides?|cruises?)\b/iu;

/**
 * Whether the curated line is an activity no map has as one point (see the file header): its name
 * or kind names a cruise, tour, hike or class (its name a show) and nothing in its name is a venue, or its
 * name is a route from one place to another.
 */
export function curatedStopOnly(row: CuratedPlaceRow): boolean {
  if (ROUTE.test(row.name_en)) return true;
  const named = ACTIVITY.test(`${row.name_en} ${row.subtype ?? ''}`) || SHOW.test(row.name_en);
  return named && !VENUE.test(row.name_en);
}

function acceptRadius(row: CuratedPlaceRow, far: boolean): number {
  if (far) return FAR_ACCEPT_RADIUS_M;
  return row.category === 'beach' ? SPREAD_ACCEPT_RADIUS_M : ACCEPT_RADIUS_M;
}

/** The first part of a compound name ("X and Y", "X & Y", "X / Y"), or null. */
function firstPart(name: string): string | null {
  const [first] = name.split(/\s+(?:and|&|\/)\s+/iu);
  return first !== undefined && first !== name && first.trim().length >= 3 ? first.trim() : null;
}

/** Asks Nominatim for one curated place (see the file header); `city` is its destination's name. */
export async function findCuratedOsmPlace(
  row: CuratedPlaceRow,
  plain: ReadonlySet<string>,
  search: NominatimSearch,
  city: string | null = null,
): Promise<OsmLookup> {
  const lead: CuratedLead = {
    name: row.name_en,
    localName: row.name_local ?? null,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    subtype: row.subtype ?? null,
  };
  const far = farReaching(row);
  // A bracket in the English name is an area or a note ("Sedlec Ossuary (Kutná Hora)").
  const bare = row.name_en.replace(/\s*\([^)]*\)\s*/gu, ' ').trim() || row.name_en;
  const local = row.name_local?.trim() ?? '';
  const withCity =
    city === null || bare.toLowerCase().includes(city.toLowerCase()) ? '' : `${bare}, ${city}`;
  const part = firstPart(bare);
  const groups: { lead: CuratedLead; names: string[] }[] = [
    { lead, names: [...new Set([local, bare, withCity])].filter((n) => n !== '') },
  ];
  if (part !== null && part !== local)
    groups.push({ lead: { ...lead, name: part }, names: [part] });
  const boxes = far ? [NEAR_DEGREES, WIDE_DEGREES] : [NEAR_DEGREES];
  let queries = 0;
  let nearestRejected: OsmLookup['nearestRejected'] = null;
  for (const degrees of boxes) {
    for (const group of groups) {
      const asked: NominatimQuery[] = group.names.map((q) => ({
        q,
        box: boxAround(row.lat, row.lng, degrees),
      }));
      const found = await findOsmPlace(group.lead, asked, plain, acceptRadius(row, far), search);
      queries += found.queries;
      if (found.place !== null) return { ...found, queries };
      const rejected = found.nearestRejected;
      if (
        rejected !== null &&
        (nearestRejected === null || rejected.distanceM < nearestRejected.distanceM)
      ) {
        nearestRejected = rejected;
      }
    }
  }
  return { place: null, queries, nearestRejected };
}
