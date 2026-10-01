/* eslint-disable lingui/no-unlocalized-strings -- colour tokens and data plumbing, not UI copy. */
/**
 * How a picked place is drawn on the boarding pass and the joined panel. A catalogue city shows
 * its own local; an airport-only city has no local yet, so Tokek covers it as guest guide (the
 * product's rule for everywhere without a live guide). The six chips keep their own guides.
 * Pure and shared: the browser builds the view for a fresh pick, the server for a stored key.
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

/**
 * A place from the bundled list (its city already in the page's language). `chipPlaces` names
 * the six chips' places, for a catalogue row that is one of them.
 */
export function placeView(
  row: PlaceRow,
  locale: string,
  chipPlaces: Readonly<Record<string, string>>,
): DestinationView {
  const [key, city] = row;
  if (findDestination(key) !== undefined) return guideView(key, chipPlaces[key] ?? city, locale);
  if (row[3] === 0) {
    const [, , , , critterName, species, critterKind, critterNo] = row;
    return {
      // Catalogue ids draw a local; a hand-drawn kind (`langur`) is a guide of its own city.
      role: critterKind.startsWith('cp-') ? 'local' : 'guide',
      destinationKey: key,
      name: critterName.toUpperCase(),
      city: city.toLocaleUpperCase(locale),
      place: city,
      species: species.toUpperCase(),
      kind: critterKind,
      seed: 1,
      bg: PASS_COLOURS[critterNo % PASS_COLOURS.length] ?? 'var(--color-yellow)',
      no: String(critterNo).padStart(3, '0'),
    };
  }
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
