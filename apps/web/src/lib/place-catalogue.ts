/**
 * The bundled place list, built from committed data: the critter catalogue (`@cp/critter-art`,
 * generated from design/critters-data.js) and the airports dataset (`@cp/content/airports`,
 * OurAirports). Server and build only: the browser gets the rows from
 * `/api/waitlist/places/<language>.json`, and the join endpoint checks a submitted key against
 * them, so a destination is always one of these places and never text a visitor typed.
 *
 * The rows are public and say where critters live, never who: a city's local is named one city at
 * a time, by `resolveDestination`, for the place a visitor picked.
 */
import { airportDataset } from '@cp/content/airports';
import { critters, isGuideSpec } from '@cp/critter-art';

import { AIRPORT_KEY_PREFIX, guideView, localView, placeView } from './destination-view';
import type { DestinationView } from './destination-view';
import { GUIDES } from './guides';
import { placeName } from './place-names';
import { compactPlaceText, foldPlaceText } from './place-search';
import type { PlaceRow } from './place-search';
import { DESTINATIONS, findDestination } from './waitlist';

const CRITTERS_BY_ID = new Map(critters.map((critter) => [critter.id, critter]));

function cityId(city: string, country: string): string {
  return `${compactPlaceText(foldPlaceText(city))}|${country.toUpperCase()}`;
}

function catalogueRows(locale: string): PlaceRow[] {
  return critters.map((critter) => {
    // The six live guides are the six chips: their catalogue city selects that chip.
    const chip = isGuideSpec(critter.spec)
      ? DESTINATIONS.find((destination) => destination.kind === critter.kind)
      : undefined;
    const city = placeName(critter.city, locale);
    return [
      chip?.key ?? critter.id,
      city,
      critter.code.toUpperCase(),
      0,
      // The hand-drawn guides are public characters; every other critter stays unnamed.
      isGuideSpec(critter.spec) ? critter.name : '',
      ...(city === critter.city ? [] : [critter.city]),
    ] as unknown as PlaceRow;
  });
}

/** One row per airport city (its largest airport), skipping cities the catalogue already has. */
function airportRows(): PlaceRow[] {
  const taken = new Set(critters.map((critter) => cityId(critter.city, critter.code)));
  const best = new Map<string, PlaceRow>();
  for (const airport of airportDataset().airports) {
    if (airport.city.trim() === '') continue;
    const id = cityId(airport.city, airport.country);
    if (taken.has(id)) continue;
    const current = best.get(id);
    if (current !== undefined && current[3] <= airport.rank) continue;
    best.set(id, [
      `${AIRPORT_KEY_PREFIX}${airport.iata.toLowerCase()}`,
      airport.city,
      airport.country,
      airport.rank,
    ]);
  }
  return [...best.values()];
}

let airports: readonly PlaceRow[] | null = null;
const rowsByLocale = new Map<string, readonly PlaceRow[]>();
const keysByLocale = new Map<string, ReadonlyMap<string, PlaceRow>>();

/**
 * Every searchable place for a page in `locale`: catalogue cities first (named the way that
 * language names them), then airport cities (as the dataset names them). Built once per language.
 */
export function placeRows(locale: string): readonly PlaceRow[] {
  let rows = rowsByLocale.get(locale);
  if (rows === undefined) {
    airports ??= airportRows();
    rows = [...catalogueRows(locale), ...airports];
    rowsByLocale.set(locale, rows);
  }
  return rows;
}

/** What `locale` calls the six chips' places, by destination key. */
export function chipPlaces(locale: string): Record<string, string> {
  return Object.fromEntries(
    GUIDES.map((guide) => [guide.destinationKey, placeName(guide.place, locale)]),
  );
}

/**
 * The place behind a stored or submitted destination key, drawn for a page in `locale`: one of
 * the six chips, a catalogue critter id, or an airport city. `null` for anything else.
 */
export function resolveDestination(key: string, locale: string): DestinationView | null {
  const chips = chipPlaces(locale);
  if (findDestination(key) !== undefined) return guideView(key, chips[key] ?? key, locale);
  let byKey = keysByLocale.get(locale);
  if (byKey === undefined) {
    byKey = new Map(placeRows(locale).map((row) => [row[0], row]));
    keysByLocale.set(locale, byKey);
  }
  const row = byKey.get(key);
  if (row === undefined) return null;
  const critter = row[3] === 0 ? CRITTERS_BY_ID.get(key) : undefined;
  return critter === undefined
    ? placeView(row, locale, chips)
    : localView({ ...critter, key }, row[1], locale);
}
