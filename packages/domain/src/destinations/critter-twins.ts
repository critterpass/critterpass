/**
 * Whether a base place is the same place as a critter destination row: the same country (the
 * row's code, its slug's `<iso2>-` prefix, or its English country name), a shared folded name or
 * alias, and, when both have coordinates, centres within `TWIN_RADIUS_KM`. Namesakes elsewhere
 * (`ca-london` and `gb-london`) never match: the country differs.
 */
import { foldName, haversineKm } from './base-set';

export const TWIN_RADIUS_KM = 40;

/** Folded names that are the same place (local, English and official names of one city). */
export const NAME_ALIASES: readonly (readonly string[])[] = [
  [
    'sai gon',
    'saigon',
    'thanh pho ho chi minh',
    'tp ho chi minh',
    'ho chi minh city',
    'ho chi minh',
    'hcmc',
  ],
  ['new york', 'new york city', 'city of new york', 'nyc'],
  ['mekong', 'mekong delta', 'dong bang song cuu long'],
];

const ALIAS_KEY = new Map(NAME_ALIASES.flatMap((group) => group.map((name) => [name, group[0]])));

/** The key a folded name compares by: its alias group's first name, else itself. */
export function aliasKey(name: string): string {
  const folded = foldName(name);
  return ALIAS_KEY.get(folded) ?? folded;
}

/** A place's own name and its English, Vietnamese and local names (other keys are not names). */
export function placeNames(
  name: string,
  names: { readonly en?: unknown; readonly vi?: unknown; readonly local?: unknown } | null,
): string[] {
  const all = [name, names?.en, names?.vi, names?.local];
  return all.filter((value): value is string => typeof value === 'string' && value !== '');
}

export function sharesName(a: Iterable<string>, b: Iterable<string>): boolean {
  const keys = new Set([...a].map(aliasKey));
  for (const name of b) if (keys.has(aliasKey(name))) return true;
  return false;
}

export interface TwinPlace {
  readonly slug?: string;
  readonly names: readonly string[];
  readonly countryCode: string | null;
  /** English country name, when the code is missing. */
  readonly country: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

function countries(place: TwinPlace): Set<string> {
  const keys = new Set<string>();
  if (place.countryCode !== null) keys.add(place.countryCode.toLowerCase());
  if (place.country !== null) keys.add(foldName(place.country));
  const prefix = place.slug === undefined ? undefined : /^([a-z]{2})-/u.exec(place.slug)?.[1];
  if (prefix !== undefined) keys.add(prefix);
  return keys;
}

export function isTwin(critter: TwinPlace, place: TwinPlace): boolean {
  const own = countries(critter);
  if (![...countries(place)].some((key) => own.has(key))) return false;
  if (!sharesName(critter.names, place.names)) return false;
  if (critter.lat === null || critter.lng === null || place.lat === null || place.lng === null) {
    return true;
  }
  return haversineKm(critter.lat, critter.lng, place.lat, place.lng) <= TWIN_RADIUS_KM;
}
