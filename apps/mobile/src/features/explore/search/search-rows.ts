/**
 * What a search row says under a place's name, so rows with one name can be told apart: the kind
 * of place, the area it is in and how far it is ("Temples · Beraban · 14 km"), or where it already
 * stands on the trip ("In the plan · Wed", "In your Ideas"). Also one row per place: the phone's
 * row and the server's for one place, or two records of one place a few steps apart, show once.
 */
import { poiCategorySchema } from '@cp/domain';
import { t } from '@lingui/core/macro';

import { foldPlaceText } from '@/data/places/fold';
import type { PlaceCandidate } from '@/data/places/match-places';

import { categoryWord } from './chip-words';

/** A search row with what the server's search adds to a place. */
export interface SearchPlace extends PlaceCandidate {
  readonly area?: string | null;
  readonly address?: string | null;
  /** Metres from the search's own point, measured by the server. */
  readonly distanceM?: number | null;
  readonly recommended?: boolean;
}

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

const SAME_PLACE_M = 150;
const EARTH_M = 6_371_000;

export function metresBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointOf(place: PlaceCandidate): Point | null {
  return place.lat === null || place.lng === null ? null : { lat: place.lat, lng: place.lng };
}

/**
 * One row per place, the first kept: rows with one id, and rows with the same name (accents and
 * case folded) within a short walk of each other. Same-named places further apart stay apart.
 */
export function onePerPlace<T extends PlaceCandidate>(rows: readonly T[]): T[] {
  const kept: T[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row.poiId ?? row.id;
    if (ids.has(id)) continue;
    const name = foldPlaceText(row.name);
    const at = pointOf(row);
    const twin = kept.some((other) => {
      if (name === '' || foldPlaceText(other.name) !== name) return false;
      const there = pointOf(other);
      return at !== null && there !== null && metresBetween(at, there) <= SAME_PLACE_M;
    });
    if (twin) continue;
    ids.add(id);
    kept.push(row);
  }
  return kept;
}

const STREET =
  /^(jl\.?|jalan|gang|gg\.?|đường|duong|ngõ|hẻm|street|st\.?|road|rd\.?|avenue|ave\.?|lane)\s/iu;
const ADMIN =
  /\b(regency|province|kabupaten|kota|prefecture|county|provinsi|tỉnh|tinh|thành phố)\b/iu;

/**
 * The area in an address: its first part that is a name, not a street, a number or a province,
 * and not the destination itself (the same rule the server's search uses).
 */
export function areaOf(address: string | null | undefined, destination: string): string | null {
  if (address === null || address === undefined) return null;
  const home = foldPlaceText(destination);
  for (const raw of address.split(',')) {
    const part = raw.trim();
    if (part === '' || part.length > 40 || /\d/u.test(part)) continue;
    if (STREET.test(part) || ADMIN.test(part)) continue;
    if (home !== '' && foldPlaceText(part) === home) continue;
    return part;
  }
  return null;
}

export function distanceWords(metres: number): string {
  if (metres < 950) {
    const m = Math.max(50, Math.round(metres / 50) * 50);
    return t({ id: 'search.row.metres', message: `${m} m` });
  }
  const km =
    metres < 9_950 ? (Math.round(metres / 100) / 10).toString() : String(Math.round(metres / 1000));
  return t({ id: 'search.row.kilometres', message: `${km} km` });
}

export function kindWord(category: string | null): string | null {
  const parsed = poiCategorySchema.safeParse(category);
  if (!parsed.success) return null;
  return parsed.data === 'other' || parsed.data === 'transit'
    ? null
    : parsed.data === 'stay'
      ? t({ id: 'search.row.kind.stay', message: 'Stay' })
      : categoryWord(parsed.data);
}

export interface RowContext {
  /** The trip's destination, left out of the area ("Bali" says nothing in Bali). */
  readonly destination: string;
  /** Where distances are measured from: the search's own point, else the destination's middle. */
  readonly from: Point | null;
  /** Addresses of the phone's places, by place id. */
  readonly addresses: ReadonlyMap<string, string>;
  /** The weekday (or day number) a place is planned on, by place id. */
  readonly planDays: ReadonlyMap<string, string>;
}

export interface RowWords {
  readonly meta: string | undefined;
  /** Already on a day of the plan: no + on the row. */
  readonly inPlan: boolean;
}

/** The row's second line. */
export function rowWords(place: SearchPlace, context: RowContext): RowWords {
  const id = place.poiId ?? place.id;
  const day = context.planDays.get(id);
  if (day !== undefined) {
    return { meta: t({ id: 'search.row.inPlan', message: `In the plan · ${day}` }), inPlan: true };
  }
  const parts: string[] = [];
  if (place.source === 'idea') parts.push(t({ id: 'search.row.saved', message: 'In your Ideas' }));
  // The place's other name ("Valley of Love" beside "Thung lũng Tình Yêu") leads the facts.
  if (place.nameLocal !== null && place.nameLocal !== '') parts.push(place.nameLocal);
  const kind = kindWord(place.category);
  if (kind !== null) parts.push(kind);
  const area =
    (place.area ?? null) ||
    areaOf(place.address ?? context.addresses.get(id) ?? null, context.destination);
  if (area !== null && area !== '') parts.push(area);
  const at = pointOf(place);
  const metres =
    place.distanceM ??
    (at !== null && context.from !== null ? metresBetween(context.from, at) : null);
  if (metres !== null && metres !== undefined) parts.push(distanceWords(metres));
  return { meta: parts.length === 0 ? undefined : parts.join(' · '), inPlan: false };
}
