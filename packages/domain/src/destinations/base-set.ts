/**
 * The destination base set: travel destinations built monthly from Wikidata (items with a
 * Wikivoyage article) and GeoNames cities, joined, ranked and capped per country. These are the
 * shared shapes and the name and distance helpers the build's pure steps use.
 */

export const DESTINATION_KINDS = ['city', 'town', 'village', 'island', 'park', 'region'] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export interface DestinationNames {
  readonly en?: string;
  readonly vi?: string;
  readonly local?: string;
}

/** One candidate destination from either source, or both once joined. */
export interface BaseCandidate {
  readonly qid: string | null;
  readonly geonamesId: number | null;
  readonly name: string;
  readonly names: DestinationNames;
  /** ISO 3166-1 alpha-2, upper case. */
  readonly countryCode: string;
  /** GeoNames admin1 name (`Bình Định`, `Sabah`), when known. */
  readonly admin1: string | null;
  readonly kind: DestinationKind;
  readonly lat: number;
  readonly lng: number;
  readonly population: number | null;
  /** Wikipedia and sister-project sitelinks: 0 for a GeoNames-only row. */
  readonly sitelinks: number;
  /** The Commons file of its Wikivoyage banner (P948), else its image (P18). */
  readonly photoFile: string | null;
  readonly elevationM?: number | null;
  /** IANA time zone, from GeoNames. */
  readonly tz?: string | null;
}

/** Lower case, accents and `đ` folded, every run of other characters one space. */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/** Every folded name a candidate goes by. */
export function foldedNames(candidate: Pick<BaseCandidate, 'name' | 'names'>): Set<string> {
  const all = [candidate.name, candidate.names.en, candidate.names.vi, candidate.names.local];
  return new Set(all.flatMap((name) => (name === undefined ? [] : [foldName(name)])));
}

/** `<iso2>-<folded name>`: the slug a new base row is offered (before collision suffixes). */
export function baseSlug(countryCode: string, name: string): string {
  const folded = foldName(name).replace(/ /gu, '-');
  return `${countryCode.toLowerCase()}-${folded === '' ? 'place' : folded}`.slice(0, 80);
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Half the side of the default search box around a destination's centre, by kind. */
export function boundsHalfKm(kind: DestinationKind): number {
  if (kind === 'city') return 6;
  if (kind === 'town' || kind === 'village') return 3;
  return 12.5;
}
