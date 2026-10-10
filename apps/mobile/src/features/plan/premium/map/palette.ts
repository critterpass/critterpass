/**
 * The premium map's two looks (design `bali-map.html`): a light cream-and-blue map and its night
 * variant, used by every map in the premium app, and the marks drawn on it. Map colours are style
 * data for MapLibre (`map-colours.json`, like the map style files), not UI colours: they paint
 * tiles and map layers, never views.
 */
import colours from './map-colours.json';

export type MapMode = 'light' | 'night';

export interface MapPalette {
  readonly sea: string;
  readonly land: string;
  readonly coast: string;
  readonly green: string;
  readonly lake: string;
  /** Main roads: casing, then fill. Below town level the light map uses the far-out pair. */
  readonly mainCasing: string;
  readonly mainFill: string;
  readonly mainCasingFar: string;
  readonly mainFillFar: string;
  /** Local roads: casing, then fill. */
  readonly localCasing: string;
  readonly localFill: string;
  readonly label: string;
  readonly labelBold: string;
  readonly labelHalo: string;
  readonly peak: string;
  /** The halo under every route line. */
  readonly routeCasing: string;
}

export interface MapMarks {
  /** A boat leg's dotted line. */
  readonly boat: string;
  /** Stay flags and the stay square. */
  readonly ink: string;
  readonly pinRing: string;
  readonly pinNumeral: string;
  readonly pinShadow: string;
  /** Deeper sun and mint so a route and its pins read on the light map. */
  readonly sunRoute: string;
  readonly mintRoute: string;
}

export const MAP_PALETTES: Readonly<Record<MapMode, MapPalette>> = {
  light: colours.light,
  night: colours.night,
};

export const MAP_MARKS: MapMarks = colours.marks;
