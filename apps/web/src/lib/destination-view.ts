/* eslint-disable lingui/no-unlocalized-strings -- colour tokens and data plumbing, not UI copy. */
/**
 * How a picked place is drawn on the boarding pass and the joined panel. A catalogue city shows
 * its own local; an airport-only city has no local yet, so Tokek covers it as guest guide (the
 * product's rule for everywhere without a live guide). The six chips keep their own guides.
 * Pure and shared: the browser builds the view for a chip or an airport city, the server for a
 * stored key and for a catalogue city a visitor picks.
 */
import { GUIDES, guideForDestination } from './guides';
import type { Guide } from './guides';
import type { PlaceRow } from './place-search';
import { findDestination } from './waitlist';

/** `guide`: a live or guest guide; `local`: the catalogue critter that lives there. */
export type DestinationRole = 'guide' | 'local';

export interface DestinationView extends Guide {
  readonly role: DestinationRole;
}

/** Airport-city keys are `apt-<iata>`; catalogue keys are the critter id (`cp-005`). */
export const AIRPORT_KEY_PREFIX = 'apt-';

const GUEST_GUIDE = GUIDES[0];
/** The pass colours the six guides use, shared out over the catalogue's locals. */
const PASS_COLOURS = GUIDES.map((guide) => guide.bg);

/**
 * One of the six chips, with its place named the way the page's language names it (`place` comes
 * from the place-name table on the server and from the page strings in the browser).
 */
export function guideView(destinationKey: string, place: string, locale: string): DestinationView {
  return {
    ...guideForDestination(destinationKey),
    role: 'guide',
    place,
    city: place.toLocaleUpperCase(locale),
  };
}

/** The critter that lives in a catalogue city. Server only: the public place list never has it. */
export interface CatalogueLocal {
  readonly key: string;
  readonly name: string;
  readonly species: string;
  readonly kind: string;
  readonly no: number;
}

/** A catalogue city (named in the page's language) with its local, as the server draws it. */
export function localView(local: CatalogueLocal, city: string, locale: string): DestinationView {
  return {
    // Catalogue ids draw a local; a hand-drawn kind (`langur`) is a guide of its own city.
    role: local.kind.startsWith('cp-') ? 'local' : 'guide',
    destinationKey: local.key,
    name: local.name.toUpperCase(),
    city: city.toLocaleUpperCase(locale),
    place: city,
    species: local.species.toUpperCase(),
    kind: local.kind,
    seed: 1,
    bg: PASS_COLOURS[local.no % PASS_COLOURS.length] ?? 'var(--color-yellow)',
    no: String(local.no).padStart(3, '0'),
  };
}

/**
 * A place from the public list (its city already in the page's language), where the list alone
 * can draw it: one of the six chips (`chipPlaces` names their places) or an airport city. `null`
 * for a catalogue city, whose local only the server names.
 */
export function placeView(
  row: PlaceRow,
  locale: string,
  chipPlaces: Readonly<Record<string, string>>,
): DestinationView | null {
  const [key, city] = row;
  if (findDestination(key) !== undefined) return guideView(key, chipPlaces[key] ?? city, locale);
  if (row[3] === 0) return null;
  if (!GUEST_GUIDE) throw new Error('destination-view: GUIDES must not be empty');
  return {
    ...GUEST_GUIDE,
    role: 'guide',
    destinationKey: key,
    city: city.toLocaleUpperCase(locale),
    place: city,
    // The airport code stands in for the pass number: `CP-DAD`.
    no: key.slice(AIRPORT_KEY_PREFIX.length).toUpperCase(),
  };
}
